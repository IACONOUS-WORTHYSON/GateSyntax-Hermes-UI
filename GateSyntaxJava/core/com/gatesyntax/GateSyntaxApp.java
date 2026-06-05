package com.gatesyntax;

import com.gatesyntax.runtime.UIRuntime;
import javafx.application.Application;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.stage.Stage;

import java.net.URL;

/** JavaFX Application wrapper — driven by GateSyntaxBuilder. */
public class GateSyntaxApp extends Application {

    // Passed from Main via static field before launch()
    static GateSyntaxBuilder pendingBuilder;

    @Override
    public void start(Stage stage) {
        GateSyntaxBuilder builder = pendingBuilder != null
                ? pendingBuilder
                : GateSyntaxBuilder.defaults();

        UIRuntime runtime = builder.buildRuntime();

        Node root = runtime.buildRoot();
        Scene scene = new Scene((Parent) root, 920, 660);

        // Load CSS theme (classpath root — packed from resources\)
        URL css = getClass().getResource(builder.getCssResource());
        if (css != null) scene.getStylesheets().add(css.toExternalForm());

        stage.setTitle(runtime.getWindowTitle());
        stage.setScene(scene);
        stage.show();

        runtime.wireBindings(stage);
    }
}
