#pragma once

#include "include/cef_render_process_handler.h"

class GroubotRenderProcessHandler final : public CefRenderProcessHandler {
 public:
  void OnContextCreated(CefRefPtr<CefBrowser> browser,
                        CefRefPtr<CefFrame> frame,
                        CefRefPtr<CefV8Context> context) override;

 private:
  IMPLEMENT_REFCOUNTING(GroubotRenderProcessHandler);
};
