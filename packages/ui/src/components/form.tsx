import { createContext, useContext, useId } from "react"
import type { ComponentPropsWithoutRef, HTMLAttributes } from "react"
import { Controller, FormProvider, useFormContext, useFormState } from "react-hook-form"
import type { ControllerProps, FieldPath, FieldValues } from "react-hook-form"

import { cn } from "../lib/utils"
import { Label } from "./label"

const Form = FormProvider

type FormFieldContextValue<TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>> = {
  name: TName
}

const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue)

function FormField<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>(
  props: ControllerProps<TFieldValues, TName>,
) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

type FormItemContextValue = { id: string }
const FormItemContext = createContext<FormItemContextValue>({} as FormItemContextValue)

function useFormField() {
  const fieldContext = useContext(FormFieldContext)
  const itemContext = useContext(FormItemContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext.name })
  const fieldState = getFieldState(fieldContext.name, formState)

  return {
    id: itemContext.id,
    name: fieldContext.name,
    formItemId: `${itemContext.id}-form-item`,
    formDescriptionId: `${itemContext.id}-form-item-description`,
    formMessageId: `${itemContext.id}-form-item-message`,
    ...fieldState,
  }
}

function FormItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const id = useId()
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
}

function FormLabel({ className, ...props }: ComponentPropsWithoutRef<typeof Label>) {
  const { error, formItemId } = useFormField()
  return <Label className={cn(error && "text-destructive", className)} htmlFor={formItemId} {...props} />
}

function FormControl({ ...props }: ComponentPropsWithoutRef<"input">) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
  return <input aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`} aria-invalid={!!error} id={formItemId} {...props} />
}

function FormDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const { formDescriptionId } = useFormField()
  return <p className={cn("text-[0.8rem] text-muted-foreground", className)} id={formDescriptionId} {...props} />
}

function FormMessage({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error.message ?? "") : children
  if (!body) return null
  return <p className={cn("text-[0.8rem] font-medium text-destructive", className)} id={formMessageId} {...props}>{body}</p>
}

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField }
