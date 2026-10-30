#include "cef_render_process_handler.h"

#include "include/cef_browser.h"
#include "include/cef_frame.h"
#include "include/cef_process_message.h"
#include "include/cef_v8.h"
#include "include/wrapper/cef_helpers.h"

namespace {

class NativeCommandHandler final : public CefV8Handler {
 public:
  bool Execute(const CefString&, CefRefPtr<CefV8Value>,
               const CefV8ValueList& arguments,
               CefRefPtr<CefV8Value>& retval, CefString&) override {
    CEF_REQUIRE_RENDERER_THREAD();
    if (arguments.empty() || !arguments[0]->IsString()) return false;

    const auto message = CefProcessMessage::Create("groubot.native-command");
    auto args = message->GetArgumentList();
    args->SetString(0, arguments[0]->GetStringValue());
    args->SetString(1, arguments.size() > 1 && arguments[1]->IsString()
                           ? arguments[1]->GetStringValue()
                           : "");
    CefV8Context::GetCurrentContext()->GetBrowser()->GetMainFrame()->SendProcessMessage(PID_BROWSER, message);
    retval = CefV8Value::CreateBool(true);
    return true;
  }

 private:
  IMPLEMENT_REFCOUNTING(NativeCommandHandler);
};

}  // namespace

void GroubotRenderProcessHandler::OnContextCreated(CefRefPtr<CefBrowser>,
                                                   CefRefPtr<CefFrame> frame,
                                                   CefRefPtr<CefV8Context> context) {
  CEF_REQUIRE_RENDERER_THREAD();
  auto object = context->GetGlobal();
  auto native = CefV8Value::CreateObject(nullptr, nullptr);
  native->SetValue("command", CefV8Value::CreateFunction("command", new NativeCommandHandler()), V8_PROPERTY_ATTRIBUTE_NONE);
  object->SetValue("groubotNative", native, V8_PROPERTY_ATTRIBUTE_NONE);

  // YouTube can decide to play an ad before any ad media request is made.
  // Strip its ad-placement metadata at assignment time so the player is
  // created for the requested video rather than entering a missing-ad state.
  static constexpr char kAdResponseHook[] = R"JS(
(() => {
  if (window.__groubotPlayerAdHookInstalled) return;
  window.__groubotPlayerAdHookInstalled = true;
  const strip = (value) => {
    if (!value || typeof value !== 'object') return value;
    for (const key of ['adPlacements', 'playerAds', 'adSlots', 'adBreakParams', 'adBreakHeartbeatParams']) {
      try { delete value[key]; } catch (_) {}
    }
    return value;
  };
  const hook = (name, transform) => {
    let value;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: () => value,
        set: (next) => { value = transform(next); },
      });
    } catch (_) {}
  };
  hook('ytInitialPlayerResponse', strip);
  hook('ytplayer', (next) => {
    try {
      const response = next?.config?.args?.player_response;
      if (response) {
        const parsed = typeof response === 'string' ? JSON.parse(response) : response;
        strip(parsed);
        if (typeof response === 'string') next.config.args.player_response = JSON.stringify(parsed);
      }
    } catch (_) {}
    return next;
  });
})();
)JS";
  CefRefPtr<CefV8Value> result;
  CefRefPtr<CefV8Exception> exception;
  context->Eval(kAdResponseHook, "groubot://ad-response-hook", 0, result, exception);

  const auto url = frame ? frame->GetURL().ToString() : std::string();
  if (url.rfind("http://", 0) != 0 && url.rfind("https://", 0) != 0) return;

  // Native CEF context menus are not reliably painted by every Linux/X11
  // embedding configuration. Keep the menu in the page surface so it remains
  // visible and interactive, while still delegating privileged actions back to
  // the browser process.
  static constexpr char kContextMenuScript[] = R"JS(
(() => {
  if (window.__groubotContextMenuInstalled) return;
  window.__groubotContextMenuInstalled = true;
  let menu;
  const remove = () => {
    menu?.remove();
    menu = undefined;
  };
  const nativeCommand = (command, value = '') => {
    try { window.groubotNative?.command(command, value); } catch (_) {}
  };
  const copyImage = async (source) => {
    try {
      const response = await fetch(source, { mode: 'cors', credentials: 'omit' });
      const blob = await response.blob();
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
      } else {
        await navigator.clipboard.writeText(source);
      }
    } catch (_) {
      try { await navigator.clipboard.writeText(source); } catch (_) {}
    }
  };
  const addItem = (label, action, disabled = false) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.disabled = disabled;
    item.style.cssText = 'display:block;width:100%;border:0;background:transparent;color:#f4f4f5;text-align:left;padding:8px 12px;border-radius:6px;font:13px system-ui,sans-serif;cursor:' + (disabled ? 'default' : 'pointer') + ';opacity:' + (disabled ? '.5' : '1') + ';';
    item.onmouseenter = () => { if (!disabled) item.style.background = 'rgba(255,255,255,.12)'; };
    item.onmouseleave = () => { item.style.background = 'transparent'; };
    item.onclick = () => { if (!disabled) action(); remove(); };
    menu.appendChild(item);
  };
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    remove();
    const target = event.target instanceof Element ? event.target : null;
    const image = target?.closest('img');
    const source = image?.currentSrc || image?.src || '';
    menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.style.cssText = 'position:fixed;z-index:2147483647;min-width:190px;max-width:280px;padding:5px;background:#242424;border:1px solid rgba(255,255,255,.18);border-radius:9px;box-shadow:0 12px 34px rgba(0,0,0,.45);';
    if (source) {
      addItem('Copy image', () => { void copyImage(source); });
      addItem('Open image in new tab', () => nativeCommand('CONTEXT_OPEN_IMAGE', source));
      const divider = document.createElement('div');
      divider.style.cssText = 'height:1px;margin:4px 0;background:rgba(255,255,255,.12);';
      menu.appendChild(divider);
    }
    addItem('Inspect', () => nativeCommand('CONTEXT_INSPECT', event.clientX + '\t' + event.clientY));
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.min(event.clientX, innerWidth - rect.width - 8) + 'px';
    menu.style.top = Math.min(event.clientY, innerHeight - rect.height - 8) + 'px';
  }, true);
  document.addEventListener('mousedown', (event) => {
    if (menu && !menu.contains(event.target)) remove();
  }, true);
  window.addEventListener('blur', remove);
})();
)JS";
  context->Eval(kContextMenuScript, "groubot://context-menu", 0, result, exception);
}

bool GroubotRenderProcessHandler::OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
                                                           CefRefPtr<CefFrame> frame,
                                                           CefProcessId source_process,
                                                           CefRefPtr<CefProcessMessage> message) {
  CEF_REQUIRE_RENDERER_THREAD();
  if (source_process != PID_BROWSER || message->GetName() != "groubot.evaluate") return false;
  const auto args = message->GetArgumentList();
  const auto request_id = args->GetString(0);
  const auto script = args->GetString(1).ToString();
  auto result_message = CefProcessMessage::Create("groubot.browser-result");
  auto result_args = result_message->GetArgumentList();
  result_args->SetString(0, request_id);
  CefRefPtr<CefV8Exception> exception;
  CefRefPtr<CefV8Value> result;
  bool ok = false;
  std::string json;
  auto context = frame->GetV8Context();
  if (context && context->Enter()) {
    ok = context->Eval(CefString("JSON.stringify((" + script + "))"), "groubot://browser-tool", 0, result, exception) && result && result->IsString();
    if (ok) json = result->GetStringValue().ToString();
    context->Exit();
  }
  result_args->SetBool(1, ok);
  result_args->SetString(2, ok ? json : (exception ? exception->GetMessage().ToString() : "Page evaluation failed."));
  frame->SendProcessMessage(PID_BROWSER, result_message);
  return true;
}
