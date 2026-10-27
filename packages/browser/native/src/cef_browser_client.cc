#include "cef_browser_client.h"

#include "command_channel.h"
#include "include/cef_app.h"
#include "include/cef_parser.h"
#include "include/wrapper/cef_helpers.h"

#include <utility>

CefBrowserClient::CefBrowserClient(CommandChannel* channel, std::string tab_id, EventHandler handler)
    : channel_(channel), tab_id_(std::move(tab_id)), handler_(std::move(handler)) {}

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

bool CefBrowserClient::OnBeforePopup(CefRefPtr<CefBrowser> browser,
                                     CefRefPtr<CefFrame>,
                                     int,
                                     const CefString& target_url,
                                     const CefString&,
                                     WindowOpenDisposition,
                                     bool,
                                     const CefPopupFeatures&,
                                     CefWindowInfo&,
                                     CefRefPtr<CefClient>&,
                                     CefBrowserSettings&,
                                     CefRefPtr<CefDictionaryValue>&,
                                     bool*) {
  // Keep OAuth links, sign-in windows, and website popups inside the active
  // Groubot tab instead of allowing CEF to create a second native window.
  handler_(browser, "POPUP", target_url.ToString());
  return true;
}

void CefBrowserClient::OnTitleChange(CefRefPtr<CefBrowser> browser, const CefString& title) {
  handler_(browser, "TITLE", title.ToString());
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

bool CefBrowserClient::OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
                                                CefRefPtr<CefFrame>,
                                                CefProcessId source_process,
                                                CefRefPtr<CefProcessMessage> message) {
  if (source_process != PID_RENDERER || message->GetName() != "groubot.native-command") return false;
  const auto args = message->GetArgumentList();
  handler_(browser, "COMMAND", args->GetString(0).ToString() + "\t" + args->GetString(1).ToString());
  return true;
}
