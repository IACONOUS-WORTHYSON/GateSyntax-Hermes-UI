package com.gatesyntax.integrador;

import java.lang.annotation.*;

/**
 * Mark a field or zero-argument method for exposure in the GateSyntax Integrador UI.
 *
 * Fields become sliders / toggles / text inputs depending on their type.
 * Methods become action buttons.
 *
 * Example:
 *   {@literal @}GsExpose(label = "Speed", min = 0, max = 200)
 *   private double speed = 50;
 *
 *   {@literal @}GsExpose(label = "Reset")
 *   public void reset() { speed = 0; }
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.FIELD, ElementType.METHOD})
public @interface GsExpose {
    String label() default "";
    double min()   default 0;
    double max()   default 100;
    String group() default "";
}
