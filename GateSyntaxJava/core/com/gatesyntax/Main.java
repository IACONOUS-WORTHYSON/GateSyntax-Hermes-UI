package com.gatesyntax;

import javafx.application.Application;

/**
 * GateSyntaxJava — JavaFX implementation of GateSyntax declarative UI.
 *
 * Run:
 *   mvn javafx:run            (from D:\IA\GateSyntaxPy-HTML)
 */
public class Main {
    public static void main(String[] args) {
        GateSyntaxApp.pendingBuilder = GateSyntaxBuilder.defaults();
        Application.launch(GateSyntaxApp.class, args);
    }
}
