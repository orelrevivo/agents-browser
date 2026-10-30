#include "cef_browser_client.h"

#include "command_channel.h"
#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/cef_context_menu_handler.h"
#include "include/cef_menu_model.h"
#include "include/cef_parser.h"
#include "include/wrapper/cef_helpers.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <iostream>
#include <utility>

namespace {

constexpr int kMenuIdOpenImageInNewTab = MENU_ID_USER_FIRST + 1;
constexpr int kMenuIdInspect = MENU_ID_USER_FIRST + 2;

class AdBlockResourceRequestHandler final : public CefResourceRequestHandler {
 public:
  explicit AdBlockResourceRequestHandler(std::string tab_id) : tab_id_(std::move(tab_id)) {}

  ReturnValue OnBeforeResourceLoad(CefRefPtr<CefBrowser> browser,
                                   CefRefPtr<CefFrame> frame,
                                   CefRefPtr<CefRequest> request,
                                   CefRefPtr<CefCallback>) override {
    if (!request || !ShouldBlock(request->GetURL().ToString())) return RV_CONTINUE;

    // Keep the log useful without dumping every request made by modern pages.
    std::cerr << "[groubot-cef] ad-block tab=" << tab_id_
              << " host=" << Hostname(Lowercase(request->GetURL().ToString())) << std::endl;
    return RV_CANCEL;
  }

 private:
  static std::string Lowercase(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char character) {
      return static_cast<char>(std::tolower(character));
    });
    return value;
  }

  static std::string Hostname(const std::string& url) {
    const auto scheme_end = url.find("://");
    const auto host_start = scheme_end == std::string::npos ? 0 : scheme_end + 3;
    const auto host_end = url.find_first_of("/?#", host_start);
    auto host = url.substr(host_start, host_end == std::string::npos ? std::string::npos : host_end - host_start);
    const auto port = host.find(':');
    if (port != std::string::npos) host.resize(port);
    return host;
  }

  static bool HasDomainSuffix(const std::string& host, const char* domain) {
    const std::string suffix(domain);
    return host == suffix || (host.size() > suffix.size() &&
                              host.compare(host.size() - suffix.size(), suffix.size(), suffix) == 0 &&
                              host[host.size() - suffix.size() - 1] == '.');
  }

  static bool ShouldBlock(const std::string& raw_url) {
    const auto url = Lowercase(raw_url);
    const auto host = Hostname(url);

    // Common third-party advertising and auction networks. These rules are
    // intentionally host-based so ordinary page URLs containing "ad" are not
    // accidentally blocked.
    static constexpr std::array<const char*, 35> ad_domains = {
        "doubleclick.net",       "googlesyndication.com", "googleadservices.com",
        "adservice.google.com",  "adnxs.com",             "adsrvr.org",
        "amazon-adsystem.com",   "criteo.com",            "pubmatic.com",
        "rubiconproject.com",    "openx.net",             "taboola.com",
        "outbrain.com",          "smartadserver.com",     "3lift.com",
        "bidswitch.net",         "casalemedia.com",       "contextweb.com",
        "quantserve.com",        "scorecardresearch.com", "media.net",
        "yandexadexchange.net",  "advertising.com",       "mathtag.com",
        "rlcdn.com",             "lijit.com",             "turn.com",
        "demdex.net",            "adsafeprotected.com",   "adform.net",
        "serving-sys.com",       "exoclick.com",          "popads.net",
        "trafficjunky.net",      "zedo.com"};
    for (const auto* domain : ad_domains) {
      if (HasDomainSuffix(host, domain)) return true;
    }

    // Path markers used by self-hosted ad servers and ad iframes. Keep this
    // list narrow; first-party sites often use the word "advertisement" in
    // legitimate articles and navigation URLs.
    static constexpr std::array<const char*, 11> ad_paths = {
        "/adserver", "/adservice", "/adsbygoogle", "/doubleclick/", "/gampad/",
        "/pagead/", "/prebid/", "/bidrequest", "/adchoice", "?ad_slot=", "&ad_slot="};
    for (const auto* marker : ad_paths) {
      if (url.find(marker) != std::string::npos) return true;
    }

    // YouTube may deliver an ad media request from the same first-party
    // video host used for normal playback. These query markers identify the
    // ad variant without blocking ordinary video segments.
    if (HasDomainSuffix(host, "googlevideo.com") || HasDomainSuffix(host, "youtube.com")) {
      static constexpr std::array<const char*, 3> first_party_ad_markers = {
          "adformat=", "ad_type=", "adunit="};
      for (const auto* marker : first_party_ad_markers) {
        if (url.find(marker) != std::string::npos) return true;
      }
    }
    return false;
  }

  std::string tab_id_;
  IMPLEMENT_REFCOUNTING(AdBlockResourceRequestHandler);
};

void InstallAdHidingScript(CefRefPtr<CefFrame> frame) {
  if (!frame || !frame->IsMain()) return;

  // Network filtering cannot distinguish YouTube's first-party ad media from
  // normal video media. This lightweight cosmetic layer removes known ad
  // containers and activates the skip control when the site exposes one.
  static constexpr char kScript[] = R"JS(
(() => {
  if (window.__groubotAdBlockRun) {
    window.__groubotAdBlockRun();
    return;
  }
  window.__groubotAdBlockInstalled = true;
  const selectors = [
    '#player-ads', '#masthead-ad', '#panels ytd-ads-engagement-panel-content-renderer',
    'ytd-ad-slot-renderer', 'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer', 'ytd-in-feed-ad-layout-renderer',
    'ytd-banner-promo-renderer', 'ytd-mealbar-promo-renderer',
    'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
    'ytd-rich-item-renderer:has(ytd-display-ad-renderer)',
    'ytd-rich-section-renderer:has(ytd-ad-slot-renderer)',
    '.ytp-ad-module', '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot',
    '.ytp-ad-text', '.ytp-ad-player-overlay', '[data-ad-slot]'
  ];
  const hide = () => {
    document.querySelectorAll(selectors.join(',')).forEach((element) => {
      element.remove();
    });
    document.querySelectorAll('ytd-ad-slot-renderer, ytd-display-ad-renderer').forEach((element) => {
      const container = element.closest('ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-compact-promoted-video-renderer');
      (container || element).remove();
    });
    document.querySelectorAll('.ytp-ad-skip-button, .ytp-skip-ad-button').forEach((button) => {
      if (button instanceof HTMLElement) button.click();
    });
    document.querySelectorAll('#movie_player.ad-showing, .html5-video-player.ad-showing').forEach((player) => {
      player.querySelectorAll('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern').forEach((button) => {
        if (button instanceof HTMLElement) button.click();
      });
      const video = player.querySelector('video') || document.querySelector('video');
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        video.muted = true;
        video.currentTime = Math.max(0, video.duration - 0.05);
        void video.play().catch(() => {});
      }
    });
  };
  window.__groubotAdBlockRun = hide;
  const installStyle = () => {
    if (document.getElementById('groubot-ad-block-style')) return;
    const style = document.createElement('style');
    style.id = 'groubot-ad-block-style';
    style.textContent = selectors.join(',') + '{display:none !important;visibility:hidden !important;}';
    (document.head || document.documentElement).appendChild(style);
  };
  installStyle();
  hide();
  new MutationObserver(() => { installStyle(); hide(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(hide, 200);
})();
)JS";
  frame->ExecuteJavaScript(kScript, "groubot://ad-block", 0);
}

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

CefRefPtr<CefResourceRequestHandler> CefBrowserClient::GetResourceRequestHandler(
    CefRefPtr<CefBrowser>,
    CefRefPtr<CefFrame>,
    CefRefPtr<CefRequest>,
    bool,
    bool,
    const CefString&,
    bool&) {
  return new AdBlockResourceRequestHandler(tab_id_);
}

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

void CefBrowserClient::OnBeforeContextMenu(CefRefPtr<CefBrowser>,
                                           CefRefPtr<CefFrame>,
                                           CefRefPtr<CefContextMenuParams> params,
                                           CefRefPtr<CefMenuModel> model) {
  CEF_REQUIRE_UI_THREAD();
  if (!params || !model || tab_id_.empty()) return;

  if (params->HasImageContents() && !params->GetSourceUrl().empty()) {
    model->AddSeparator();
    model->AddItem(kMenuIdOpenImageInNewTab, "Open image in new tab");
  }

  model->AddSeparator();
  model->AddItem(kMenuIdInspect, "Inspect");
}

bool CefBrowserClient::OnContextMenuCommand(CefRefPtr<CefBrowser> browser,
                                             CefRefPtr<CefFrame>,
                                             CefRefPtr<CefContextMenuParams> params,
                                             int command_id,
                                             EventFlags) {
  CEF_REQUIRE_UI_THREAD();
  if (!browser || !params || tab_id_.empty()) return false;

  if (command_id == kMenuIdOpenImageInNewTab) {
    const auto image_url = params->GetSourceUrl().ToString();
    if (image_url.empty()) return true;
    // Let the renderer create a normal Groubot web tab so the image gets the
    // same tab history, selection, visibility, and persistence as any other
    // user-created tab.
    handler_(browser, "OPEN_TAB", image_url);
    return true;
  }

  if (command_id == kMenuIdInspect) {
    CefWindowInfo window_info;
    CefBrowserSettings settings;
    browser->GetHost()->ShowDevTools(
        window_info,
        browser->GetHost()->GetClient(),
        settings,
        CefPoint(params->GetXCoord(), params->GetYCoord()));
    return true;
  }

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
  if (frame->IsMain()) {
    InstallAdHidingScript(frame);
    handler_(browser, "URL", url.ToString());
  }
}

void CefBrowserClient::OnLoadStart(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, TransitionType) {
  if (frame->IsMain()) handler_(browser, "LOAD_START", "");
}

void CefBrowserClient::OnLoadEnd(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame, int status_code) {
  if (frame->IsMain()) {
    InstallAdHidingScript(frame);
    handler_(browser, "LOAD_END", std::to_string(status_code));
  }
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
