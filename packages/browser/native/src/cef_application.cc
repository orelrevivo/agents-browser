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
#include <utility>

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

std::string EscapeJson(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size() + 8);
  for (const auto character : value) {
    if (character == '\\' || character == '"') escaped += '\\';
    if (character == '\n') escaped += "\\n";
    else if (character == '\r') escaped += "\\r";
    else escaped += character;
  }
  return escaped;
}

std::pair<std::string, std::string> SplitValue(const std::string& value) {
  const auto separator = value.find('\t');
  if (separator == std::string::npos) return {value, {}};
  return {value.substr(0, separator), value.substr(separator + 1)};
}

}  // namespace

CefApplication::CefApplication(CommandChannel* channel)
    : channel_(channel), render_handler_(new GroubotRenderProcessHandler()) {}

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
  request_context_ = CefRequestContext::CreateContext(context_settings, nullptr);
  parent_window_ = parent_window;
  width_ = width;
  height_ = height;
  std::cerr << "[groubot-cef] creating-browser" << std::endl;

  CefWindowInfo window_info;
  window_info.SetAsChild(parent_window, CefRect(x, y, width, height));
  CefBrowserSettings browser_settings;
  shell_client_ = new CefBrowserClient(channel_, "", [this](CefRefPtr<CefBrowser> browser, const std::string& event, const std::string& value) {
    HandleBrowserEvent(browser, event, value);
  });
  CefBrowserHost::CreateBrowser(window_info, shell_client_, url, browser_settings, nullptr, request_context_);
  std::cerr << "[groubot-cef] browser-requested" << std::endl;
}

void CefApplication::HandleCommand(const std::string& command, const std::string& value) {
  CefPostTask(TID_UI, base::BindOnce(&CefApplication::HandleCommandOnUi, this, command, value));
}

void CefApplication::HandleCommandOnUi(const std::string& command, const std::string& value) {
  CEF_REQUIRE_UI_THREAD();
  auto browser = shell_browser_;
  if (active_tab_id_ != "home") {
    const auto found = external_tabs_.find(active_tab_id_);
    browser = found == external_tabs_.end() ? nullptr : found->second;
  }
  if (command == "NAVIGATE") {
    if (browser) browser->GetMainFrame()->LoadURL(value);
  } else if (command == "BACK") {
    if (browser) browser->GoBack();
  } else if (command == "FORWARD") {
    if (browser) browser->GoForward();
  } else if (command == "RELOAD") {
    if (browser) browser->Reload();
  } else if (command == "CLOSE") {
    if (shell_browser_) shell_browser_->GetHost()->CloseBrowser(true);
    return;
  } else if (command == "RESIZE") {
    std::stringstream stream(value);
    int x = 0, y = 0, width = 0, height = 0;
    char separator = 0;
    stream >> x >> separator >> y >> separator >> width >> separator >> height;
    if (width > 0 && height > 0) {
      width_ = width;
      height_ = height;
      auto* display = XOpenDisplay(nullptr);
      if (display) {
        if (parent_window_) XMoveResizeWindow(display, parent_window_, x, y, static_cast<unsigned>(width), static_cast<unsigned>(height));
        for (const auto& [tab_id, tab] : external_tabs_) {
          const auto handle = tab->GetHost()->GetWindowHandle();
          if (handle) XMoveResizeWindow(display, handle, 0, 104, static_cast<unsigned>(width), static_cast<unsigned>(height - 104));
        }
        XFlush(display);
        XCloseDisplay(display);
      }
      if (shell_browser_) shell_browser_->GetHost()->WasResized();
      for (const auto& [tab_id, tab] : external_tabs_) tab->GetHost()->WasResized();
    }
  }
}

void CefApplication::HandleBrowserEvent(CefRefPtr<CefBrowser> browser, const std::string& event, const std::string& value) {
  CEF_REQUIRE_UI_THREAD();
  if (event == "READY") {
    if (value.empty()) {
      shell_browser_ = browser;
      channel_->Send("READY", "shell");
    } else {
      external_tabs_[value] = browser;
      browser_tab_ids_[browser->GetIdentifier()] = value;
      SetTabVisibility(value, value == active_tab_id_);
      NotifyShell("READY", value, "");
      channel_->Send("READY", value);
    }
    return;
  }
  if (event == "COMMAND") {
    const auto [command, payload] = SplitValue(value);
    HandleNativeCommand(browser, command, payload);
    return;
  }
  if (event == "POPUP") {
    const auto tab = browser_tab_ids_.find(browser->GetIdentifier());
    if (tab != browser_tab_ids_.end()) browser->GetMainFrame()->LoadURL(value);
    return;
  }
  const auto tab = browser_tab_ids_.find(browser->GetIdentifier());
  if (tab == browser_tab_ids_.end()) {
    if (event == "CLOSED") {
      shell_browser_ = nullptr;
      channel_->Send("CLOSED");
      CefQuitMessageLoop();
    }
    return;
  }
  if (event == "URL" || event == "TITLE" || event == "LOAD_START" || event == "LOAD_END" || event == "LOAD_ERROR") {
    channel_->Send(event, tab->second + "\t" + value);
  }
  NotifyShell(event, tab->second, value);
  if (event == "CLOSED") {
    external_tabs_.erase(tab->second);
    browser_tab_ids_.erase(tab);
  }
}

void CefApplication::HandleNativeCommand(CefRefPtr<CefBrowser>, const std::string& command, const std::string& value) {
  const auto [tab_id, payload] = SplitValue(value);
  if (command == "NAVIGATE") {
    active_tab_id_ = tab_id;
    if (tab_id == "home") {
      shell_browser_->GetMainFrame()->LoadURL(payload);
      return;
    }
    auto found = external_tabs_.find(tab_id);
    if (found == external_tabs_.end()) CreateExternalTab(tab_id, payload);
    else found->second->GetMainFrame()->LoadURL(payload);
    SetTabVisibility(tab_id, true);
  } else if (command == "CREATE_TAB") {
    active_tab_id_ = tab_id;
    CreateExternalTab(tab_id, payload.empty() ? "about:blank" : payload);
  } else if (command == "SELECT_TAB") {
    active_tab_id_ = tab_id;
    SetTabVisibility(tab_id, true);
  } else if (command == "CLOSE_TAB") {
    const auto found = external_tabs_.find(tab_id);
    if (found != external_tabs_.end()) found->second->GetHost()->CloseBrowser(true);
    if (active_tab_id_ == tab_id) { active_tab_id_ = "home"; SetTabVisibility("home", true); }
  } else if (command == "BACK" || command == "FORWARD" || command == "RELOAD") {
    HandleCommandOnUi(command, {});
  }
}

void CefApplication::CreateExternalTab(const std::string& tab_id, const std::string& url) {
  if (!shell_browser_ || external_tabs_.find(tab_id) != external_tabs_.end()) return;
  CefWindowInfo window_info;
  window_info.SetAsChild(parent_window_, CefRect(0, 104, width_, height_ - 104));
  CefBrowserSettings browser_settings;
  auto* client = new CefBrowserClient(channel_, tab_id, [this](CefRefPtr<CefBrowser> browser, const std::string& event, const std::string& value) {
    HandleBrowserEvent(browser, event, value);
  });
  CefBrowserHost::CreateBrowser(window_info, client, url, browser_settings, nullptr, request_context_);
}

void CefApplication::SetTabVisibility(const std::string& tab_id, bool visible) {
  if (shell_browser_) {
    const auto handle = shell_browser_->GetHost()->GetWindowHandle();
    if (handle) {
      auto* display = XOpenDisplay(nullptr);
      if (display) {
        // Keep the React shell mapped at all times. External tabs are child
        // windows positioned below the tab bar and toolbar, so the shell
        // remains interactive while website content is visible.
        if (visible) XMapWindow(display, handle);
        XFlush(display);
        XCloseDisplay(display);
      }
    }
  }
  for (const auto& [id, browser] : external_tabs_) {
    const auto handle = browser->GetHost()->GetWindowHandle();
    if (!handle) continue;
    auto* display = XOpenDisplay(nullptr);
    if (!display) continue;
    if (id == tab_id && visible) XMapWindow(display, handle);
    else XUnmapWindow(display, handle);
    XFlush(display);
    XCloseDisplay(display);
  }
}

void CefApplication::NotifyShell(const std::string& type, const std::string& tab_id, const std::string& value) {
  if (!shell_browser_ || !shell_browser_->GetMainFrame()) return;
  const auto script = "window.groubotNativeEvent && window.groubotNativeEvent({type:\"" + EscapeJson(type) + "\",tabId:\"" + EscapeJson(tab_id) + "\",value:\"" + EscapeJson(value) + "\"});";
  shell_browser_->GetMainFrame()->ExecuteJavaScript(script, "groubot://native", 0);
}
