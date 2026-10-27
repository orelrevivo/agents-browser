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
               CefRefPtr<CefV8Value>&, CefString&) override {
    CEF_REQUIRE_RENDERER_THREAD();
    if (arguments.empty() || !arguments[0]->IsString()) return false;

    const auto message = CefProcessMessage::Create("groubot.native-command");
    auto args = message->GetArgumentList();
    args->SetString(0, arguments[0]->GetStringValue());
    args->SetString(1, arguments.size() > 1 && arguments[1]->IsString()
                           ? arguments[1]->GetStringValue()
                           : "");
    CefV8Context::GetCurrentContext()->GetBrowser()->GetMainFrame()->SendProcessMessage(PID_BROWSER, message);
    return true;
  }

 private:
  IMPLEMENT_REFCOUNTING(NativeCommandHandler);
};

}  // namespace

void GroubotRenderProcessHandler::OnContextCreated(CefRefPtr<CefBrowser>,
                                                   CefRefPtr<CefFrame>,
                                                   CefRefPtr<CefV8Context> context) {
  CEF_REQUIRE_RENDERER_THREAD();
  auto object = context->GetGlobal();
  auto native = CefV8Value::CreateObject(nullptr, nullptr);
  native->SetValue("command", CefV8Value::CreateFunction("command", new NativeCommandHandler()), V8_PROPERTY_ATTRIBUTE_NONE);
  object->SetValue("groubotNative", native, V8_PROPERTY_ATTRIBUTE_NONE);
}
