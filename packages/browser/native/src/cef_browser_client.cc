#include "cef_browser_client.h"

#include "command_channel.h"
#include "include/cef_app.h"
#include "include/cef_parser.h"
#include "include/wrapper/cef_helpers.h"

CefBrowserClient::CefBrowserClient(CommandChannel* channel) : channel_(channel) {}

void CefBrowserClient::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  browser_ = browser;
  channel_->Send("READY");
}

void CefBrowserClient::OnBeforeClose(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  if (browser_ && browser_->IsSame(browser)) browser_ = nullptr;
  channel_->Send("CLOSED");
  CefQuitMessageLoop();
}

void CefBrowserClient::OnTitleChange(CefRefPtr<CefBrowser>, const CefString& title) {
  channel_->Send("TITLE", title.ToString());
}

void CefBrowserClient::OnAddressChange(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, const CefString& url) {
  if (frame->IsMain()) channel_->Send("URL", url.ToString());
}

void CefBrowserClient::OnLoadStart(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, TransitionType) {
  if (frame->IsMain()) channel_->Send("LOAD_START");
}

void CefBrowserClient::OnLoadEnd(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, int) {
  if (frame->IsMain()) channel_->Send("LOAD_END");
}

void CefBrowserClient::OnLoadingStateChange(CefRefPtr<CefBrowser>, bool, bool can_go_back, bool can_go_forward) {
  channel_->Send("HISTORY", std::string(can_go_back ? "1" : "0") + "\t" + (can_go_forward ? "1" : "0"));
}

void CefBrowserClient::OnLoadError(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, ErrorCode error_code, const CefString& error_text, const CefString& failed_url) {
  if (frame->IsMain() && error_code != ERR_ABORTED) {
    channel_->Send("LOAD_ERROR", std::to_string(error_code) + "\t" + failed_url.ToString() + "\t" + error_text.ToString());
  }
}
