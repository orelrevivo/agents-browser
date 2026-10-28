#include "cef_application.h"

#include "cef_browser_client.h"
#include "command_channel.h"
#include "include/cef_browser.h"
#include "include/cef_command_line.h"
#include "include/cef_request_context.h"
#include "include/cef_parser.h"
#include "include/cef_task.h"
#include "include/base/cef_callback.h"
#include "include/wrapper/cef_closure_task.h"
#include "include/wrapper/cef_helpers.h"

#include <X11/Xlib.h>
#include <X11/extensions/shape.h>
#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <string>
#include <utility>
#include <spawn.h>
#include <limits.h>
#include <unistd.h>

extern char** environ;

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

void ClearRestoredWindowState(const std::string& profile) {
  // Groubot owns tab state in React. Chromium's native session snapshots are
  // therefore not authoritative and can resurrect old CEF windows on startup.
  // Remove only those snapshots; cookies, history, local storage, and other
  // authentication data remain in the profile untouched.
  std::error_code error;
  std::filesystem::remove_all(std::filesystem::path(profile) / "Default" / "Sessions", error);
  error.clear();
  std::filesystem::remove_all(std::filesystem::path(profile) / "Default" / "Sessions_Encrypted", error);
}

}  // namespace

CefApplication::CefApplication(CommandChannel* channel, int argc, char* argv[])
    : channel_(channel), render_handler_(new GroubotRenderProcessHandler()) {
  launch_args_.reserve(static_cast<size_t>(argc));
  for (int index = 0; index < argc; ++index) {
    launch_args_.emplace_back(argv[index]);
  }
}

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
  auto width = static_cast<int>(Argument(command_line, "width"));
  auto height = static_cast<int>(Argument(command_line, "height"));
  if ((width <= 0 || height <= 0) && parent_window) {
    auto* display = XOpenDisplay(nullptr);
    if (display) {
      XWindowAttributes attributes{};
      if (XGetWindowAttributes(display, parent_window, &attributes)) {
        width = attributes.width;
        height = attributes.height;
      }
      XCloseDisplay(display);
    }
  }
  if (width <= 0) width = 1440;
  if (height <= 0) height = 900;
  const auto url = StringArgument(command_line, "url", "https://claude.ai/");
  const auto profile = StringArgument(command_line, "profile", "/tmp/groubot-cef-profile");

  std::filesystem::create_directories(profile);
  ClearRestoredWindowState(profile);
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
  }, [this](CefRefPtr<CefBrowser> opener, const std::string& popup_url, CefWindowInfo& popup_window, CefRefPtr<CefClient>& popup_client, CefBrowserSettings& popup_settings) {
    ConfigurePopup(opener, popup_url, popup_window, popup_client, popup_settings);
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
    stream >> x >> y >> width >> height;
    if (width > 0 && height > 0) {
      width_ = width;
      height_ = height;
      auto* display = XOpenDisplay(nullptr);
      if (display) {
        if (shell_browser_) {
          const auto handle = shell_browser_->GetHost()->GetWindowHandle();
          if (handle) {
            XMoveResizeWindow(display, handle, 0, 0, static_cast<unsigned>(width), static_cast<unsigned>(height));
            XShapeCombineMask(display, handle, ShapeBounding, 0, 0, None, ShapeSet);
            XShapeCombineMask(display, handle, ShapeInput, 0, 0, None, ShapeSet);
            XShapeCombineMask(display, handle, ShapeClip, 0, 0, None, ShapeSet);
            XClearArea(display, handle, 0, 0, static_cast<unsigned>(width), static_cast<unsigned>(height), True);
          }
        }
        ApplyBrowserBounds();
        XFlush(display);
        XSync(display, False);
        XCloseDisplay(display);
      }
      if (shell_browser_) {
        shell_browser_->GetHost()->NotifyMoveOrResizeStarted();
        shell_browser_->GetHost()->NotifyScreenInfoChanged();
        shell_browser_->GetHost()->WasResized();
      }
      for (const auto& [tab_id, tab] : external_tabs_) {
        tab->GetHost()->NotifyMoveOrResizeStarted();
        tab->GetHost()->NotifyScreenInfoChanged();
        tab->GetHost()->WasResized();
      }
      NotifyShell("RESIZE", "shell", std::to_string(width) + "x" + std::to_string(height));
    }
  }
}

void CefApplication::HandleBrowserEvent(CefRefPtr<CefBrowser> browser, const std::string& event, const std::string& value) {
  CEF_REQUIRE_UI_THREAD();
  if (event == "LOAD_START" || event == "LOAD_END" || event == "LOAD_ERROR" ||
      event == "RENDER_PROCESS_TERMINATED") {
    std::cerr << "[groubot-cef] " << event << " " << value << std::endl;
  }
  if (event == "SHORTCUT") {
    NotifyShell("SHORTCUT", "home", value);
    return;
  }
  if (event == "READY") {
    if (value.empty()) {
      shell_browser_ = browser;
      channel_->Send("READY", "shell");
    } else {
      external_tabs_[value] = browser;
      browser_tab_ids_[browser->GetIdentifier()] = value;
      int content_x = 0;
      int content_y = 0;
      int content_width = 0;
      int content_height = 0;
      GetContentBounds(
          &content_x,
          &content_y,
          &content_width,
          &content_height);
      AttachBrowserWindow(
          browser,
          content_x,
          content_y,
          content_width,
          content_height);
      SetTabVisibility(value, value.rfind("__popup_", 0) == 0 || value == active_tab_id_);
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
    const bool popup = tab->second.rfind("__popup_", 0) == 0;
    external_tabs_.erase(tab->second);
    external_clients_.erase(tab->second);
    browser_tab_ids_.erase(tab);
    if (popup) SetTabVisibility(active_tab_id_, true);
  }
}

void CefApplication::HandleNativeCommand(CefRefPtr<CefBrowser>, const std::string& command, const std::string& value) {
  if (command == "BROWSER_EVAL") {
    auto parsed = CefParseJSON(value, JSON_PARSER_RFC);
    if (parsed && parsed->GetType() == VTYPE_DICTIONARY) {
      auto dictionary = parsed->GetDictionary();
      ExecutePageScript(dictionary->GetString("tabId").ToString(), dictionary->GetString("requestId").ToString(), dictionary->GetString("script").ToString());
    }
    return;
  }
  if (command == "NEW_WINDOW") {
    // A new Groubot window must boot the React shell. Do not let the child
    // inherit a website URL or fall back to CEF's test-page default.
    auto shell_url = StringArgument(
        CefCommandLine::GetGlobalCommandLine(),
        "url",
        "about:blank");
    std::cerr << "[groubot-cef] new-window-requested url=" << shell_url
              << std::endl;
    LaunchIndependentWindow(shell_url);
    return;
  }
  if (command == "SET_LAYOUT") {
    layout_mode_ = value == "sidebar" ? "sidebar" : "top";
    ApplyBrowserBounds();
    return;
  }
  if (command == "SET_OVERLAY") {
    SetOverlayVisibility(value);
    return;
  }
  if (command == "DOWNLOAD_PAUSE" || command == "DOWNLOAD_CANCEL") {
    const auto client = external_clients_.find(active_tab_id_);
    if (client != external_clients_.end()) {
      client->second->ControlDownload(
          static_cast<uint32_t>(std::stoul(value)),
          command == "DOWNLOAD_PAUSE" ? "pause" : "cancel");
    }
    return;
  }
  if (command == "BROWSER_CLICK" || command == "BROWSER_TYPE") {
    auto parsed = CefParseJSON(value, JSON_PARSER_RFC);
    if (!parsed || parsed->GetType() != VTYPE_DICTIONARY) return;
    auto dictionary = parsed->GetDictionary();
    const auto tab_id = dictionary->GetString("tabId").ToString();
    const auto found = external_tabs_.find(tab_id);
    if (found == external_tabs_.end() || !found->second) return;
    auto host = found->second->GetHost();
    if (command == "BROWSER_CLICK") {
      CefMouseEvent mouse;
      mouse.x = dictionary->GetInt("x");
      mouse.y = dictionary->GetInt("y");
      host->SendMouseMoveEvent(mouse, false);
      host->SendMouseClickEvent(mouse, MBT_LEFT, false, 1);
      host->SendMouseClickEvent(mouse, MBT_LEFT, true, 1);
      return;
    }
    const auto text = dictionary->GetString("text").ToString16();
    for (const auto character : text) {
      CefKeyEvent key;
      key.size = sizeof(key);
      key.type = KEYEVENT_CHAR;
      key.character = character;
      key.unmodified_character = character;
      key.focus_on_editable_field = true;
      host->SendKeyEvent(key);
    }
    return;
  }
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

void CefApplication::ExecutePageScript(const std::string& tab_id, const std::string& request_id, const std::string& script) {
  const auto found = external_tabs_.find(tab_id);
  if (found == external_tabs_.end() || !found->second->GetMainFrame()) {
    NotifyShell("BROWSER_RESULT", tab_id, "{\"requestId\":\"" + EscapeJson(request_id) + "\",\"ok\":false,\"error\":\"Browser tab is not available.\"}");
    return;
  }
  auto message = CefProcessMessage::Create("groubot.evaluate");
  auto args = message->GetArgumentList();
  args->SetString(0, request_id);
  args->SetString(1, script);
  found->second->GetMainFrame()->SendProcessMessage(PID_RENDERER, message);
}

void CefApplication::CreateExternalTab(const std::string& tab_id, const std::string& url) {
  if (!shell_browser_ || external_tabs_.find(tab_id) != external_tabs_.end()) return;
  int content_x = 0;
  int content_y = 0;
  int content_width = 0;
  int content_height = 0;
  GetContentBounds(&content_x, &content_y, &content_width, &content_height);
  CefWindowInfo window_info;
  // Parent website browsers to the plain X11 host window, exactly like the
  // shell. Parenting to the shell's CEF-owned window lets Chromium embed the
  // page inside the shell surface at (0,0), covering the tab bar and toolbar.
  window_info.SetAsChild(parent_window_, CefRect(content_x, content_y, content_width, content_height));
  std::cerr << "[groubot-cef] create-external-tab id=" << tab_id << " bounds=" << content_x << "," << content_y << " " << content_width << "x" << content_height << std::endl;
  CefBrowserSettings browser_settings;
  auto* client = new CefBrowserClient(channel_, tab_id, [this](CefRefPtr<CefBrowser> browser, const std::string& event, const std::string& value) {
    HandleBrowserEvent(browser, event, value);
  }, [this](CefRefPtr<CefBrowser> opener, const std::string& popup_url, CefWindowInfo& popup_window, CefRefPtr<CefClient>& popup_client, CefBrowserSettings& popup_settings) {
    ConfigurePopup(opener, popup_url, popup_window, popup_client, popup_settings);
  });
  external_clients_[tab_id] = client;
  CefBrowserHost::CreateBrowser(window_info, client, url, browser_settings, nullptr, request_context_);
  if (!bounds_guard_started_) {
    bounds_guard_started_ = true;
    CefPostDelayedTask(TID_UI, base::BindOnce(&CefApplication::EnforceTabBounds, this), 150);
  }
}

void CefApplication::ConfigurePopup(CefRefPtr<CefBrowser> opener,
                                    const std::string& url,
                                    CefWindowInfo& window_info,
                                    CefRefPtr<CefClient>& client,
                                    CefBrowserSettings& settings) {
  const auto popup_id = "__popup_" + std::to_string(++popup_counter_);
  const auto popup_width = std::min(width_ - 80, 900);
  const auto popup_height = std::min(height_ - 140, 700);
  const auto popup_x = std::max(20, (width_ - popup_width) / 2);
  const auto popup_y = std::max(20, (height_ - popup_height) / 2);
  window_info.SetAsChild(parent_window_, CefRect(popup_x, popup_y, popup_width, popup_height));
  client = new CefBrowserClient(channel_, popup_id, [this](CefRefPtr<CefBrowser> browser, const std::string& event, const std::string& value) {
    HandleBrowserEvent(browser, event, value);
  }, [this](CefRefPtr<CefBrowser> popup_opener, const std::string& popup_url, CefWindowInfo& popup_window, CefRefPtr<CefClient>& popup_client, CefBrowserSettings& popup_settings) {
    ConfigurePopup(popup_opener, popup_url, popup_window, popup_client, popup_settings);
  });
  (void)opener;
  (void)url;
  (void)settings;
}

void CefApplication::AttachBrowserWindow(CefRefPtr<CefBrowser> browser, int x, int y, int width, int height) {
  if (!browser || !parent_window_) return;
  const auto handle = browser->GetHost()->GetWindowHandle();
  if (!handle) {
    std::cerr << "[groubot-cef] attach-skipped no-window-handle" << std::endl;
    return;
  }
  std::cerr << "[groubot-cef] attach handle=" << handle << " parent=" << parent_window_ << " bounds=" << x << "," << y << " " << width << "x" << height << std::endl;
  auto* display = XOpenDisplay(nullptr);
  if (!display) return;
  XSetWindowAttributes attributes{};
  attributes.override_redirect = True;
  XChangeWindowAttributes(display, handle, CWOverrideRedirect, &attributes);
  XUnmapWindow(display, handle);
  XReparentWindow(display, handle, parent_window_, x, y);
  XSetWindowBorderWidth(display, handle, 0);
  XMoveResizeWindow(display, handle, x, y, static_cast<unsigned>(width), static_cast<unsigned>(height));
  XMapWindow(display, handle);
  XFlush(display);
  XCloseDisplay(display);
}

void CefApplication::GetContentBounds(int* x, int* y, int* width, int* height) const {
  if (layout_mode_ == "sidebar") {
    *x = 232;
    *y = 64;
    *width = std::max(1, width_ - *x - 4);
    *height = std::max(1, height_ - *y - 4);
    return;
  }

  *x = 0;
  *y = 104;
  *width = width_;
  *height = std::max(1, height_ - *y);
}

void CefApplication::ApplyBrowserBounds() {
  int x = 0;
  int y = 0;
  int width = 0;
  int height = 0;
  GetContentBounds(&x, &y, &width, &height);

  for (const auto& [tab_id, browser] : external_tabs_) {
    AttachBrowserWindow(browser, x, y, width, height);
    browser->GetHost()->WasResized();
  }
}

void CefApplication::EnforceTabBounds() {
  CEF_REQUIRE_UI_THREAD();
  if (parent_window_) {
    auto* display = XOpenDisplay(nullptr);
    if (display) {
      XWindowAttributes parent_attr{};
      if (XGetWindowAttributes(display, parent_window_, &parent_attr)) {
        if (parent_attr.width > 0 && parent_attr.height > 0 &&
            (parent_attr.width != width_ || parent_attr.height != height_)) {
          width_ = parent_attr.width;
          height_ = parent_attr.height;
          if (shell_browser_) {
            const auto shell_handle = shell_browser_->GetHost()->GetWindowHandle();
            if (shell_handle) {
              XMoveResizeWindow(display, shell_handle, 0, 0, static_cast<unsigned>(width_), static_cast<unsigned>(height_));
              XShapeCombineMask(display, shell_handle, ShapeBounding, 0, 0, None, ShapeSet);
              XShapeCombineMask(display, shell_handle, ShapeInput, 0, 0, None, ShapeSet);
              XShapeCombineMask(display, shell_handle, ShapeClip, 0, 0, None, ShapeSet);
              XClearArea(display, shell_handle, 0, 0, static_cast<unsigned>(width_), static_cast<unsigned>(height_), True);
            }
            shell_browser_->GetHost()->NotifyMoveOrResizeStarted();
            shell_browser_->GetHost()->NotifyScreenInfoChanged();
            shell_browser_->GetHost()->WasResized();
            NotifyShell("RESIZE", "shell", std::to_string(width_) + "x" + std::to_string(height_));
          }
        }
      }

      int x = 0;
      int y = 0;
      int width = 0;
      int height = 0;
      GetContentBounds(&x, &y, &width, &height);
      for (const auto& [tab_id, tab] : external_tabs_) {
        if (tab_id.rfind("__popup_", 0) == 0 || !tab) continue;
        const auto handle = tab->GetHost()->GetWindowHandle();
        if (!handle) continue;

        Window root = 0;
        Window parent = 0;
        Window* children = nullptr;
        unsigned int child_count = 0;
        if (XQueryTree(display, handle, &root, &parent, &children, &child_count)) {
          if (children) XFree(children);
          if (parent != parent_window_) {
            XReparentWindow(display, handle, parent_window_, x, y);
          }
        }

        XWindowAttributes attributes{};
        if (XGetWindowAttributes(display, handle, &attributes) &&
            (attributes.x != x || attributes.y != y ||
             attributes.width != width || attributes.height != height)) {
          XMoveResizeWindow(display, handle, x, y, static_cast<unsigned>(width), static_cast<unsigned>(height));
          tab->GetHost()->NotifyMoveOrResizeStarted();
          tab->GetHost()->NotifyScreenInfoChanged();
          tab->GetHost()->WasResized();
        }
      }
      XFlush(display);
      XCloseDisplay(display);
    }
  }
  CefPostDelayedTask(TID_UI, base::BindOnce(&CefApplication::EnforceTabBounds, this), 150);
}

void CefApplication::SetOverlayVisibility(const std::string& value) {
  if (!parent_window_) return;

  auto* display = XOpenDisplay(nullptr);
  if (!display) return;

  const auto shell_handle = shell_browser_
      ? shell_browser_->GetHost()->GetWindowHandle()
      : 0;
  if (!shell_handle) {
    XCloseDisplay(display);
    return;
  }

  const bool open = value.rfind("open", 0) == 0;
  if (open) {
    // Browser chrome and external CEF pages are separate native surfaces.
    // While a chrome panel is open, temporarily hide the page surface so the
    // React shell can render the panel normally without X11 sibling-window
    // clipping. The tab/browser itself stays alive and is restored on close.
    for (const auto& [tab_id, tab] : external_tabs_) {
      const auto page_handle = tab->GetHost()->GetWindowHandle();
      if (page_handle) XUnmapWindow(display, page_handle);
    }

    XShapeCombineMask(display, shell_handle, ShapeBounding, 0, 0, None, ShapeSet);
    XShapeCombineMask(display, shell_handle, ShapeInput, 0, 0, None, ShapeSet);
    XShapeCombineMask(display, shell_handle, ShapeClip, 0, 0, None, ShapeSet);
    XMapWindow(display, shell_handle);
    XRaiseWindow(display, shell_handle);
    XFlush(display);
    XCloseDisplay(display);
    std::cerr << "[groubot-cef] overlay-open page-surface-hidden" << std::endl;
    return;
  }

  if (!open) {
    // Restore the full React shell first, then restore the active website
    // surface above the content area. No browser tab is closed or recreated.
    XShapeCombineMask(display, shell_handle, ShapeBounding, 0, 0, None, ShapeSet);
    XShapeCombineMask(display, shell_handle, ShapeInput, 0, 0, None, ShapeSet);
    XShapeCombineMask(display, shell_handle, ShapeClip, 0, 0, None, ShapeSet);
    XMapWindow(display, shell_handle);
    XFlush(display);
    XCloseDisplay(display);
    SetTabVisibility(active_tab_id_, true);
    std::cerr << "[groubot-cef] overlay-close page-surface-restored" << std::endl;
    return;
  }
}

void CefApplication::LaunchIndependentWindow(const std::string& shell_url) {
  if (launch_args_.empty()) return;

  // Resolve the actual running host so this command always starts another
  // Groubot CEF shell, even when argv[0] came from a desktop launcher.
  std::string executable_path;
  char self_path[PATH_MAX]{};
  const auto self_length = readlink("/proc/self/exe", self_path, sizeof(self_path) - 1);
  if (self_length > 0) {
    self_path[self_length] = '\0';
    executable_path = self_path;
  }
  if (executable_path.empty()) executable_path = launch_args_.front();

  std::vector<std::string> child_arguments;
  child_arguments.reserve(launch_args_.size() + 1);

  bool has_shell_url = false;
  for (const auto& argument : launch_args_) {
    if (argument.rfind("--type=", 0) == 0 ||
        argument.rfind("--parent-window=", 0) == 0) {
      continue;
    }

    if (argument.rfind("--url=", 0) == 0) {
      child_arguments.push_back("--url=" + shell_url);
      has_shell_url = true;
      continue;
    }

    child_arguments.push_back(argument);
  }

  if (!has_shell_url) {
    child_arguments.push_back("--url=" + shell_url);
  }

  std::vector<char*> arguments;
  arguments.reserve(child_arguments.size() + 1);
  for (auto& argument : child_arguments) {
    arguments.push_back(argument.data());
  }
  arguments.push_back(nullptr);

  // The parent host sets this variable so its first CEF browser can attach to
  // the shell window. A new Groubot process must create its own native window,
  // not attach to the existing one.
  std::vector<std::string> child_environment;
  for (char** environment = environ; environment && *environment; ++environment) {
    const std::string entry(*environment);
    if (entry.rfind("GROUBOT_CEF_PARENT_WINDOW=", 0) == 0) continue;
    child_environment.push_back(entry);
  }

  std::vector<char*> environment;
  environment.reserve(child_environment.size() + 1);
  for (auto& entry : child_environment) {
    environment.push_back(entry.data());
  }
  environment.push_back(nullptr);

  pid_t child_pid = 0;
  const auto result = posix_spawn(
      &child_pid,
      executable_path.c_str(),
      nullptr,
      nullptr,
      arguments.data(),
      environment.data());

  if (result != 0) {
    std::cerr << "[groubot-cef] failed-to-create-window error=" << result
              << std::endl;
  } else {
    std::cerr << "[groubot-cef] independent-window-created pid=" << child_pid
              << " url=" << shell_url
              << std::endl;
  }
}

void CefApplication::SetTabVisibility(const std::string& tab_id, bool visible) {
  auto* display = XOpenDisplay(nullptr);
  if (!display) return;

  if (shell_browser_) {
    const auto handle = shell_browser_->GetHost()->GetWindowHandle();
    if (handle) {
      // Keep the React shell mapped for the tab bar and toolbar. The active
      // website surface is raised below it in the content area below.
      XMapWindow(display, handle);
    }
  }

  Window active_handle = 0;
  for (const auto& [id, browser] : external_tabs_) {
    const auto handle = browser->GetHost()->GetWindowHandle();
    if (!handle) continue;
    if (id == tab_id && visible) {
      XMapWindow(display, handle);
      active_handle = handle;
    } else {
      XUnmapWindow(display, handle);
    }
  }

  if (active_handle) {
    // External tab windows are siblings of the shell. Raising the selected
    // page after every tab switch prevents the shell's background surface
    // from covering a page after a click, popup, or navigation event.
    XRaiseWindow(display, active_handle);
  }

  XFlush(display);
  XCloseDisplay(display);
}

void CefApplication::NotifyShell(const std::string& type, const std::string& tab_id, const std::string& value) {
  if (!shell_browser_ || !shell_browser_->GetMainFrame()) return;
  const auto script = "window.groubotNativeEvent && window.groubotNativeEvent({type:\"" + EscapeJson(type) + "\",tabId:\"" + EscapeJson(tab_id) + "\",value:\"" + EscapeJson(value) + "\"});";
  shell_browser_->GetMainFrame()->ExecuteJavaScript(script, "groubot://native", 0);
}
