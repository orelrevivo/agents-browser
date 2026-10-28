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
                                                   CefRefPtr<CefFrame>,
                                                   CefRefPtr<CefV8Context> context) {
  CEF_REQUIRE_RENDERER_THREAD();
  auto object = context->GetGlobal();
  auto native = CefV8Value::CreateObject(nullptr, nullptr);
  native->SetValue("command", CefV8Value::CreateFunction("command", new NativeCommandHandler()), V8_PROPERTY_ATTRIBUTE_NONE);
  object->SetValue("groubotNative", native, V8_PROPERTY_ATTRIBUTE_NONE);
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
