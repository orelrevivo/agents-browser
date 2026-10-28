#include "cef_browser_client.h"

#include "command_channel.h"
#include "include/cef_app.h"
#include "include/cef_parser.h"
#include "include/wrapper/cef_helpers.h"

#include <algorithm>
#include <iostream>
#include <utility>

namespace {

std::string EscapeJson(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size() + 8);

  for (const auto character : value) {
    if (character == '\\' || character == '"') escaped += '\\';

    if (character == '\n') {
      escaped += "\\n";
    } else if (character == '\r') {
      escaped += "\\r";
    } else {
      escaped += character;
    }
  }

  return escaped;
}

}  // namespace

CefBrowserClient::CefBrowserClient(CommandChannel* channel, std::string tab_id, EventHandler handler, PopupHandler popup_handler)
    : channel_(channel), tab_id_(std::move(tab_id)), handler_(std::move(handler)), popup_handler_(std::move(popup_handler)) {}

void CefBrowserClient::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  browser_ = browser;
  handler_(browser, "READY", tab_id_);
}

void CefBrowserClient::OnBeforeClose(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  if (browser_ && browser_->IsSame(browser)) browser_ = nullptr;
  handler_(browser, "CLOSED", "");
}

void CefBrowserClient::OnRenderProcessTerminated(
    CefRefPtr<CefBrowser> browser,
    TerminationStatus status,
    int error_code,
    const CefString& error_string) {
  CEF_REQUIRE_UI_THREAD();

  std::cerr << "[groubot-cef] render-process-terminated tab=" << tab_id_
            << " status=" << static_cast<int>(status)
            << " error_code=" << error_code
            << " error=" << error_string.ToString() << std::endl;
  handler_(browser, "RENDER_PROCESS_TERMINATED",
           std::to_string(static_cast<int>(status)) + "\t" +
               std::to_string(error_code));

  // Keep the existing tab and session. CEF can restart the renderer for the
  // same browser instance; reloading here recovers pages that went blank
  // after a renderer crash or an unrecoverable renderer error.
  if (browser && browser->IsValid() && browser->GetMainFrame()) {
    browser->ReloadIgnoreCache();
  }
}

bool CefBrowserClient::OnBeforePopup(CefRefPtr<CefBrowser> browser,
                                     CefRefPtr<CefFrame>,
                                     int,
                                     const CefString& target_url,
                                     const CefString&,
                                     CefLifeSpanHandler::WindowOpenDisposition,
                                     bool,
                                     const CefPopupFeatures&,
                                     CefWindowInfo& window_info,
                                     CefRefPtr<CefClient>& client,
                                     CefBrowserSettings& settings,
                                     CefRefPtr<CefDictionaryValue>&,
                                     bool*) {
  if (popup_handler_) {
    popup_handler_(browser, target_url.ToString(), window_info, client, settings);
    return false;
  }
  return true;
}

bool CefBrowserClient::OnConsoleMessage(CefRefPtr<CefBrowser>,
                                        cef_log_severity_t,
                                        const CefString& message,
                                        const CefString& source,
                                        int line) {
  std::cerr << "[groubot-cef] console " << source.ToString() << ":" << line
            << " " << message.ToString() << std::endl;
  return false;
}

bool CefBrowserClient::OnPreKeyEvent(CefRefPtr<CefBrowser> browser,
                                     const CefKeyEvent& event,
                                     CefEventHandle,
                                     bool*) {
  const auto modifier = EVENTFLAG_CONTROL_DOWN | EVENTFLAG_COMMAND_DOWN;
  if ((event.type == KEYEVENT_RAWKEYDOWN || event.type == KEYEVENT_KEYDOWN) &&
      (event.modifiers & modifier) != 0 &&
      (event.windows_key_code == 'T' || event.character == 't' || event.character == 'T')) {
    // Chromium's default accelerator opens its own New Tab window. Groubot
    // owns tab creation in React, so forward the shortcut to the shell and
    // consume it here before Chromium handles it.
    handler_(browser, "SHORTCUT", "CTRL_T");
    return true;
  }
  if ((event.type == KEYEVENT_RAWKEYDOWN || event.type == KEYEVENT_KEYDOWN) &&
      (event.modifiers & modifier) != 0 && event.windows_key_code == 9) {
    handler_(browser, "SHORTCUT", (event.modifiers & EVENTFLAG_SHIFT_DOWN) ? "CTRL_TAB_PREV" : "CTRL_TAB_NEXT");
    return true;
  }
  return false;
}

void CefBrowserClient::OnTitleChange(CefRefPtr<CefBrowser> browser, const CefString& title) {
  handler_(browser, "TITLE", title.ToString());
}

void CefBrowserClient::OnFaviconURLChange(CefRefPtr<CefBrowser> browser, const std::vector<CefString>& icon_urls) {
  if (!icon_urls.empty()) handler_(browser, "FAVICON", icon_urls.front().ToString());
}

void CefBrowserClient::OnAddressChange(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, const CefString& url) {
  if (frame->IsMain()) handler_(browser, "URL", url.ToString());
}

void CefBrowserClient::OnLoadStart(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, TransitionType) {
  if (frame->IsMain()) handler_(browser, "LOAD_START", "");
}

void CefBrowserClient::OnLoadEnd(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, int status_code) {
  if (frame->IsMain()) handler_(browser, "LOAD_END", std::to_string(status_code));
}

void CefBrowserClient::OnLoadingStateChange(CefRefPtr<CefBrowser> browser, bool is_loading, bool can_go_back, bool can_go_forward) {
  handler_(browser, "HISTORY", std::string(is_loading ? "1" : "0") + "\t" + (can_go_back ? "1" : "0") + "\t" + (can_go_forward ? "1" : "0"));
}

void CefBrowserClient::OnLoadError(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, ErrorCode error_code, const CefString& error_text, const CefString& failed_url) {
  if (frame->IsMain() && error_code != ERR_ABORTED) {
    handler_(browser, "LOAD_ERROR", std::to_string(error_code) + "\t" + failed_url.ToString() + "\t" + error_text.ToString());
  }
}

bool CefBrowserClient::OnBeforeDownload(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefDownloadItem> download_item,
    const CefString& suggested_name,
    CefRefPtr<CefBeforeDownloadCallback> callback) {
  CEF_REQUIRE_UI_THREAD();

  if (!callback || !download_item) return false;

  callback->Continue(suggested_name, false);
  return true;
}

void CefBrowserClient::OnDownloadUpdated(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefDownloadItem> download_item,
    CefRefPtr<CefDownloadItemCallback> callback) {
  CEF_REQUIRE_UI_THREAD();

  if (!download_item || !download_item->IsValid()) return;

  const auto status = download_item->IsInProgress()
                          ? (download_item->IsPaused() ? "paused" : "downloading")
                          : download_item->IsComplete()
                              ? "completed"
                              : "failed";
  const auto progress = std::max(0, download_item->GetPercentComplete());
  const auto value =
      std::string("{\"id\":\"") + std::to_string(download_item->GetId()) +
      "\",\"fileName\":\"" +
      EscapeJson(download_item->GetSuggestedFileName().ToString()) +
      "\",\"progress\":" + std::to_string(progress) +
      ",\"status\":\"" + status + "\"}";

  download_callbacks_[download_item->GetId()] = callback;
  handler_(browser, "DOWNLOAD", value);
}

void CefBrowserClient::ControlDownload(uint32_t download_id,
                                       const std::string& action) {
  const auto found = download_callbacks_.find(download_id);
  if (found == download_callbacks_.end() || !found->second) return;

  if (action == "pause") {
    found->second->Pause();
  } else if (action == "resume") {
    found->second->Resume();
  } else if (action == "cancel") {
    found->second->Cancel();
    download_callbacks_.erase(found);
  }
}

bool CefBrowserClient::OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
                                                CefRefPtr<CefFrame>,
                                                CefProcessId source_process,
                                                CefRefPtr<CefProcessMessage> message) {
  if (source_process == PID_RENDERER && message->GetName() == "groubot.browser-result") {
    const auto args = message->GetArgumentList();
    const auto request_id = args->GetString(0).ToString();
    const auto ok = args->GetBool(1);
    const auto result = args->GetString(2).ToString();
    std::string escaped;
    for (const auto character : result) { if (character == '\\' || character == '"') escaped += '\\'; if (character == '\n') escaped += "\\n"; else if (character == '\r') escaped += "\\r"; else escaped += character; }
    const auto value = std::string("{\"requestId\":\"") + request_id + "\",\"ok\":" + (ok ? "true" : "false") + (ok ? ",\"result\":" + result : ",\"error\":\"" + escaped + "\"") + "}";
    handler_(browser, "BROWSER_RESULT", value);
    return true;
  }
  if (source_process != PID_RENDERER || message->GetName() != "groubot.native-command") return false;
  const auto args = message->GetArgumentList();
  handler_(browser, "COMMAND", args->GetString(0).ToString() + "\t" + args->GetString(1).ToString());
  return true;
}
