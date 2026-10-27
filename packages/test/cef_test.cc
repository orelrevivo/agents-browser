#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/cef_client.h"
#include "include/cef_command_line.h"
#include "include/cef_request_context.h"
#include "include/views/cef_box_layout.h"
#include "include/views/cef_browser_view.h"
#include "include/views/cef_button_delegate.h"
#include "include/views/cef_fill_layout.h"
#include "include/views/cef_label_button.h"
#include "include/views/cef_panel.h"
#include "include/views/cef_textfield.h"
#include "include/views/cef_textfield_delegate.h"
#include "include/views/cef_window.h"
#include "include/wrapper/cef_helpers.h"

#include <filesystem>
#include <iostream>
#include <string>
#include <X11/Xlib.h>

namespace {

constexpr char kInitialUrl[] = "https://claude.ai/";
Display* g_display = nullptr;
Window g_parent_window = 0;

class BrowserWindowDelegate;

std::string NormalizeUrl(std::string value) {
  if (value.empty()) return kInitialUrl;
  if (value.find("://") != std::string::npos) return value;
  if (value.find(' ') == std::string::npos && value.find('.') != std::string::npos) {
    return "https://" + value;
  }
  std::string encoded;
  for (const char character : value) encoded += character == ' ' ? '+' : character;
  return "https://www.google.com/search?q=" + encoded;
}

class BrowserHandler : public CefClient,
                      public CefDisplayHandler,
                      public CefLifeSpanHandler,
                      public CefLoadHandler {
 public:
  explicit BrowserHandler(bool popup) : popup_(popup) {}

  CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
  CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }

  void OnTitleChange(CefRefPtr<CefBrowser> browser, const CefString& title) override {
    std::cout << "[cef] title=" << title.ToString() << " url="
              << browser->GetMainFrame()->GetURL().ToString() << std::endl;
  }

  void OnAfterCreated(CefRefPtr<CefBrowser> browser) override {
    CEF_REQUIRE_UI_THREAD();
    browser_ = browser;
  }

  void OnBeforeClose(CefRefPtr<CefBrowser> browser) override {
    CEF_REQUIRE_UI_THREAD();
    if (browser_ && browser_->IsSame(browser)) browser_ = nullptr;
    CefQuitMessageLoop();
  }

  void OnLoadError(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
                   ErrorCode error_code, const CefString& error_text,
                   const CefString& failed_url) override {
    if (error_code != ERR_ABORTED) {
      std::cerr << "[cef] load_error=" << error_code << " url="
                << failed_url.ToString() << " message=" << error_text.ToString() << std::endl;
    }
  }

  CefRefPtr<CefBrowser> browser() const { return browser_; }

 private:
  bool popup_;
  CefRefPtr<CefBrowser> browser_;
  IMPLEMENT_REFCOUNTING(BrowserHandler);
};

class BrowserViewDelegate : public CefBrowserViewDelegate {
 public:
  explicit BrowserViewDelegate(CefRefPtr<BrowserHandler> handler) : handler_(handler) {}

  bool OnPopupBrowserViewCreated(CefRefPtr<CefBrowserView>,
                                 CefRefPtr<CefBrowserView> popup_browser_view,
                                 bool) override;
  cef_runtime_style_t GetBrowserRuntimeStyle() override { return CEF_RUNTIME_STYLE_DEFAULT; }

 private:
  CefRefPtr<BrowserHandler> handler_;
  IMPLEMENT_REFCOUNTING(BrowserViewDelegate);
};

class NavigationButtonDelegate : public CefButtonDelegate {
 public:
  enum class Action { Back, Forward, Reload };
  NavigationButtonDelegate(CefRefPtr<BrowserHandler> handler, Action action)
      : handler_(handler), action_(action) {}

  void OnButtonPressed(CefRefPtr<CefButton>) override {
    auto browser = handler_->browser();
    if (!browser) return;
    if (action_ == Action::Back) browser->GoBack();
    if (action_ == Action::Forward) browser->GoForward();
    if (action_ == Action::Reload) browser->Reload();
  }

 private:
  CefRefPtr<BrowserHandler> handler_;
  Action action_;
  IMPLEMENT_REFCOUNTING(NavigationButtonDelegate);
};

class AddressDelegate : public CefTextfieldDelegate {
 public:
  explicit AddressDelegate(CefRefPtr<BrowserHandler> handler) : handler_(handler) {}

  bool OnKeyEvent(CefRefPtr<CefTextfield> textfield, const CefKeyEvent& event) override {
    if (event.type == KEYEVENT_RAWKEYDOWN && event.windows_key_code == 13) {
      Navigate(textfield);
      return true;
    }
    return false;
  }

  void Navigate(CefRefPtr<CefTextfield> textfield) {
    auto browser = handler_->browser();
    if (browser) browser->GetMainFrame()->LoadURL(NormalizeUrl(textfield->GetText().ToString()));
  }

 private:
  CefRefPtr<BrowserHandler> handler_;
  IMPLEMENT_REFCOUNTING(AddressDelegate);
};

class BrowserWindowDelegate : public CefWindowDelegate {
 public:
  BrowserWindowDelegate(CefRefPtr<CefBrowserView> browser_view,
                        CefRefPtr<BrowserHandler> handler,
                        bool popup)
      : browser_view_(browser_view), popup_(popup), handler_(handler) {}

  void OnWindowCreated(CefRefPtr<CefWindow> window) override {
    std::cerr << "[cef] window-created" << std::endl;
    // The browser view must receive the entire top-level window bounds. Without
    // a fill layout, CEF creates the window but leaves the browser view at 0x0.
    window->SetToFillLayout();
    window->AddChildView(browser_view_);
    window->SetSize(CefSize(1200, 800));
    const auto native_window = window->GetWindowHandle();
    if (native_window) {
      auto* display = XOpenDisplay(nullptr);
      if (display) {
        XMoveResizeWindow(display, native_window, 100, 100, 1200, 800);
        XFlush(display);
        XCloseDisplay(display);
      }
    }
    window->Show();
    window->SetBounds(CefRect(100, 100, 1200, 800));
    return;
    auto toolbar = CefPanel::CreatePanel(nullptr);
    CefBoxLayoutSettings toolbar_settings;
    toolbar_settings.horizontal = true;
    toolbar_settings.between_child_spacing = 6;
    toolbar_settings.inside_border_insets = CefInsets(8, 8, 8, 8);
    auto toolbar_layout = toolbar->SetToBoxLayout(toolbar_settings);

    auto back = CefLabelButton::CreateLabelButton(
        new NavigationButtonDelegate(handler_, NavigationButtonDelegate::Action::Back), "Back");
    auto forward = CefLabelButton::CreateLabelButton(
        new NavigationButtonDelegate(handler_, NavigationButtonDelegate::Action::Forward), "Forward");
    auto reload = CefLabelButton::CreateLabelButton(
        new NavigationButtonDelegate(handler_, NavigationButtonDelegate::Action::Reload), "Reload");
    auto address_delegate = new AddressDelegate(handler_);
    auto address = CefTextfield::CreateTextfield(address_delegate);
    address->SetText(kInitialUrl);
    address->SetPlaceholderText("Enter URL or search");

    toolbar->AddChildView(back);
    toolbar->AddChildView(forward);
    toolbar->AddChildView(reload);
    toolbar->AddChildView(address);
    toolbar_layout->SetFlexForView(address, 1);
    CefBoxLayoutSettings window_settings;
    window_settings.horizontal = false;
    window_settings.default_flex = 0;
    auto window_layout = window->SetToBoxLayout(window_settings);
    window->AddChildView(toolbar);
    window->AddChildView(browser_view_);
    window_layout->SetFlexForView(browser_view_, 1);
    window->Show();
  }

  bool CanClose(CefRefPtr<CefWindow>) override {
    auto browser = browser_view_->GetBrowser();
    return !browser || browser->GetHost()->TryCloseBrowser();
  }

  CefSize GetPreferredSize(CefRefPtr<CefView>) override { return CefSize(1200, 800); }
  cef_runtime_style_t GetWindowRuntimeStyle() override { return CEF_RUNTIME_STYLE_DEFAULT; }

 private:
  CefRefPtr<CefBrowserView> browser_view_;
  bool popup_;
  CefRefPtr<BrowserHandler> handler_;
  IMPLEMENT_REFCOUNTING(BrowserWindowDelegate);
};

class BrowserApp : public CefApp, public CefBrowserProcessHandler {
 public:
  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }

  void OnContextInitialized() override {
    CEF_REQUIRE_UI_THREAD();
    std::cerr << "[cef] context-initialized" << std::endl;
    auto handler = new BrowserHandler(false);
    CefBrowserSettings browser_settings;
    CefRequestContextSettings context_settings;
    CefString(&context_settings.cache_path) = std::string("/tmp/groubot-cef-root-cache-2-20261027/profile");
    context_settings.persist_session_cookies = true;
    auto request_context = CefRequestContext::CreateContext(context_settings, nullptr);
    CefWindowInfo window_info;
    window_info.SetAsChild(g_parent_window, CefRect(0, 0, 1200, 800));
    CefBrowserHost::CreateBrowser(window_info, handler, kInitialUrl, browser_settings, nullptr, request_context);
  }

 private:
  IMPLEMENT_REFCOUNTING(BrowserApp);
};

}  // namespace

bool BrowserViewDelegate::OnPopupBrowserViewCreated(
    CefRefPtr<CefBrowserView>, CefRefPtr<CefBrowserView> popup_browser_view, bool) {
  CefWindow::CreateTopLevelWindow(
      new BrowserWindowDelegate(popup_browser_view, handler_, true));
  return true;
}

int main(int argc, char* argv[]) {
  CefMainArgs main_args(argc, argv);
  const int exit_code = CefExecuteProcess(main_args, nullptr, nullptr);
  if (exit_code >= 0) return exit_code;

  g_display = XOpenDisplay(nullptr);
  if (!g_display) {
    std::cerr << "[cef] failed-to-open-x11-display" << std::endl;
    return 1;
  }
  const auto root_window = DefaultRootWindow(g_display);
  g_parent_window = XCreateSimpleWindow(g_display, root_window, 100, 100, 1200, 800, 0, 0, 0);
  XStoreName(g_display, g_parent_window, "Groubot CEF Test");
  XSelectInput(g_display, g_parent_window, ExposureMask | StructureNotifyMask | KeyPressMask | ButtonPressMask);
  XMapWindow(g_display, g_parent_window);
  XFlush(g_display);

  CefSettings settings;
  settings.no_sandbox = true;
  settings.log_severity = LOGSEVERITY_INFO;
  std::filesystem::create_directories("/tmp/groubot-cef-root-cache-2-20261027/profile");
  CefString(&settings.root_cache_path) = std::string("/tmp/groubot-cef-root-cache-2-20261027");
  CefString(&settings.resources_dir_path) = std::string("/tmp/groubot-cef-build-156/Release");
  CefString(&settings.locales_dir_path) = std::string("/tmp/groubot-cef-build-156/Release/locales");
  auto app = new BrowserApp();
  if (!CefInitialize(main_args, settings, app, nullptr)) return CefGetExitCode();
  CefRunMessageLoop();
  CefShutdown();
  XDestroyWindow(g_display, g_parent_window);
  XCloseDisplay(g_display);
  return 0;
}
