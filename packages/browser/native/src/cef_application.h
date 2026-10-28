#pragma once

#include "include/cef_app.h"
#include "cef_browser_client.h"
#include "cef_render_process_handler.h"

#include <map>
#include <cstdint>
#include <string>
#include <vector>

class CommandChannel;

class CefApplication final : public CefApp,
                             public CefBrowserProcessHandler,
                             public CefRenderProcessHandler {
 public:
  CefApplication(CommandChannel* channel, int argc, char* argv[]);
  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }
  CefRefPtr<CefRenderProcessHandler> GetRenderProcessHandler() override { return render_handler_; }
  void OnBeforeCommandLineProcessing(const CefString& process_type, CefRefPtr<CefCommandLine> command_line) override;
  void OnContextInitialized() override;
  void HandleCommand(const std::string& command, const std::string& value);

 private:
  void HandleBrowserEvent(CefRefPtr<CefBrowser> browser, const std::string& event, const std::string& value);
  void HandleNativeCommand(CefRefPtr<CefBrowser> source, const std::string& command, const std::string& value);
  void CreateExternalTab(const std::string& tab_id, const std::string& url);
  void ConfigurePopup(CefRefPtr<CefBrowser> opener,
                      const std::string& url,
                      CefWindowInfo& window_info,
                      CefRefPtr<CefClient>& client,
                      CefBrowserSettings& settings);
  void AttachBrowserWindow(CefRefPtr<CefBrowser> browser, int x, int y, int width, int height);
  void SetTabVisibility(const std::string& tab_id, bool visible);
  void NotifyShell(const std::string& type, const std::string& tab_id, const std::string& value);
  void HandleCommandOnUi(const std::string& command, const std::string& value);
  void ExecutePageScript(const std::string& tab_id, const std::string& request_id, const std::string& script);
  void LaunchIndependentWindow(const std::string& shell_url);
  void ApplyBrowserBounds();
  void GetContentBounds(int* x, int* y, int* width, int* height) const;
  void SetOverlayVisibility(const std::string& value);
  CommandChannel* channel_;
  CefWindowHandle parent_window_ = 0;
  int width_ = 1440;
  int height_ = 900;
  uint64_t popup_counter_ = 0;
  CefRefPtr<CefRequestContext> request_context_;
  CefRefPtr<GroubotRenderProcessHandler> render_handler_;
  CefRefPtr<CefBrowser> shell_browser_;
  CefRefPtr<CefBrowserClient> shell_client_;
  std::map<std::string, CefRefPtr<CefBrowser>> external_tabs_;
  std::map<std::string, CefRefPtr<CefBrowserClient>> external_clients_;
  std::map<int, std::string> browser_tab_ids_;
  std::string active_tab_id_ = "home";
  std::string layout_mode_ = "top";
  std::vector<std::string> launch_args_;
  IMPLEMENT_REFCOUNTING(CefApplication);
};
