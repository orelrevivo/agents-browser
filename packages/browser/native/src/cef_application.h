#pragma once

#include "include/cef_app.h"
#include "cef_browser_client.h"

#include <string>

class CommandChannel;

class CefApplication final : public CefApp, public CefBrowserProcessHandler {
 public:
  explicit CefApplication(CommandChannel* channel);
  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }
  void OnBeforeCommandLineProcessing(const CefString& process_type, CefRefPtr<CefCommandLine> command_line) override;
  void OnContextInitialized() override;
  void HandleCommand(const std::string& command, const std::string& value);

 private:
  void HandleCommandOnUi(const std::string& command, const std::string& value);
  CommandChannel* channel_;
  CefRefPtr<CefBrowserClient> client_;
  IMPLEMENT_REFCOUNTING(CefApplication);
};
