#include "cef_application.h"

#include "cef_browser_client.h"
#include "command_channel.h"
#include "include/cef_browser.h"
#include "include/cef_command_line.h"
#include "include/cef_request_context.h"
#include "include/cef_task.h"
#include "include/base/cef_callback.h"
#include "include/wrapper/cef_closure_task.h"
#include "include/wrapper/cef_helpers.h"

#include <X11/Xlib.h>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <string>

#include <cstdlib>

namespace {

uint64_t Argument(const CefRefPtr<CefCommandLine>& command_line, const char* name, uint64_t fallback = 0) {
  const auto value = command_line->GetSwitchValue(name).ToString();
  if (value.empty()) return fallback;
  return std::strtoull(value.c_str(), nullptr, 10);
}

std::string StringArgument(const CefRefPtr<CefCommandLine>& command_line, const char* name, std::string fallback = {}) {
  const auto value = command_line->GetSwitchValue(name).ToString();
  return value.empty() ? fallback : value;
}

}  // namespace

CefApplication::CefApplication(CommandChannel* channel) : channel_(channel) {}

void CefApplication::OnBeforeCommandLineProcessing(const CefString&, CefRefPtr<CefCommandLine> command_line) {
  // The native host embeds the browser in an X11 window. Keep Chromium on the
  // same platform instead of allowing a Wayland/Vulkan surface underneath it.
  command_line->AppendSwitchWithValue("ozone-platform", "x11");
  const auto* disable_gpu = std::getenv("GROUBOT_DISABLE_GPU");
  if (disable_gpu && std::string(disable_gpu) == "1") {
    command_line->AppendSwitch("disable-gpu");
    command_line->AppendSwitch("disable-gpu-compositing");
  }
}

void CefApplication::OnContextInitialized() {
  CEF_REQUIRE_UI_THREAD();
  std::cerr << "[groubot-cef] context-initialized" << std::endl;
  auto command_line = CefCommandLine::GetGlobalCommandLine();
  auto parent_window = static_cast<CefWindowHandle>(Argument(command_line, "parent-window"));
  if (!parent_window) {
    const auto* environment_window = std::getenv("GROUBOT_CEF_PARENT_WINDOW");
    if (environment_window) parent_window = static_cast<CefWindowHandle>(std::strtoull(environment_window, nullptr, 10));
  }
  const auto x = static_cast<int>(Argument(command_line, "x"));
  const auto y = static_cast<int>(Argument(command_line, "y"));
  const auto width = static_cast<int>(Argument(command_line, "width", 800));
  const auto height = static_cast<int>(Argument(command_line, "height", 600));
  const auto url = StringArgument(command_line, "url", "https://claude.ai/");
  const auto profile = StringArgument(command_line, "profile", "/tmp/groubot-cef-profile");

  std::filesystem::create_directories(profile);
  CefRequestContextSettings context_settings;
  CefString(&context_settings.cache_path) = profile;
  context_settings.persist_session_cookies = true;
  const auto request_context = CefRequestContext::CreateContext(context_settings, nullptr);
  std::cerr << "[groubot-cef] creating-browser" << std::endl;

  CefWindowInfo window_info;
  window_info.SetAsChild(parent_window, CefRect(x, y, width, height));
  CefBrowserSettings browser_settings;
  client_ = new CefBrowserClient(channel_);
  CefBrowserHost::CreateBrowser(window_info, client_, url, browser_settings, nullptr, request_context);
  std::cerr << "[groubot-cef] browser-requested" << std::endl;
}

void CefApplication::HandleCommand(const std::string& command, const std::string& value) {
  CefPostTask(TID_UI, base::BindOnce(&CefApplication::HandleCommandOnUi, this, command, value));
}

void CefApplication::HandleCommandOnUi(const std::string& command, const std::string& value) {
  CEF_REQUIRE_UI_THREAD();
  const auto browser = client_ ? client_->browser() : nullptr;
  if (!browser) return;

  if (command == "NAVIGATE") {
    browser->GetMainFrame()->LoadURL(value);
  } else if (command == "BACK") {
    browser->GoBack();
  } else if (command == "FORWARD") {
    browser->GoForward();
  } else if (command == "RELOAD") {
    browser->Reload();
  } else if (command == "CLOSE") {
    browser->GetHost()->CloseBrowser(true);
    return;
  } else if (command == "RESIZE") {
    std::stringstream stream(value);
    int x = 0, y = 0, width = 0, height = 0;
    char separator = 0;
    stream >> x >> separator >> y >> separator >> width >> separator >> height;
    const auto handle = browser->GetHost()->GetWindowHandle();
    if (handle && width > 0 && height > 0) {
      auto* display = XOpenDisplay(nullptr);
      if (display) {
        XMoveResizeWindow(display, handle, x, y, static_cast<unsigned>(width), static_cast<unsigned>(height));
        XFlush(display);
        XCloseDisplay(display);
      }
      browser->GetHost()->WasResized();
    }
  }
}
