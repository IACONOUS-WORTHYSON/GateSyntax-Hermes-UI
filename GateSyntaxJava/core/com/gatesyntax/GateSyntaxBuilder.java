package com.gatesyntax;

import com.gatesyntax.runtime.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Fluent builder — mirrors GateSyntax.GateSyntaxBuilder. */
public class GateSyntaxBuilder {

    private final List<String> contents = new ArrayList<>();
    private String cssResource = "/theme.css";   // classpath root — served from resources\

    // ── Source loading ────────────────────────────────────────────────────────

    /** Add a single .ui file by filesystem path. */
    public GateSyntaxBuilder addFile(Path path) {
        try {
            contents.add(Files.readString(path, StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new RuntimeException("Cannot read " + path, e);
        }
        return this;
    }

    /**
     * Load *.ui files from a filesystem directory.
     * main.ui is loaded first; the rest follow alphabetically.
     */
    public GateSyntaxBuilder addDirectory(Path dir) {
        String[] files = { "main.ui", "controls.ui", "binding.ui", "commands.ui", "data.ui" };
        for (String f : files) {
            Path p = dir.resolve(f);
            if (Files.exists(p)) addFile(p);
        }
        return this;
    }

    /** Convenience — resolves relative to the JVM working directory. */
    public GateSyntaxBuilder addDirectory(String dir) {
        return addDirectory(Path.of(dir));
    }

    public GateSyntaxBuilder withCss(String classpathResource) {
        this.cssResource = classpathResource;
        return this;
    }

    // ── Build ─────────────────────────────────────────────────────────────────

    public UIRuntime buildRuntime() {
        SyntaxParser     parser = new SyntaxParser();
        StateStore       store  = new StateStore();
        List<SyntaxNode> nodes  = new ArrayList<>();

        for (String content : contents)
            nodes.addAll(parser.parseContent(content, "ui"));

        for (SyntaxNode n : nodes)
            if (n instanceof StateDecl sd)
                store.setDefault(sd.name(), sd.defaultValue());

        return new UIRuntime(nodes, store);
    }

    public String getCssResource() { return cssResource; }

    // ── Static factory ────────────────────────────────────────────────────────

    /** Default: load from UI\ beside the working directory, CSS from classpath. */
    public static GateSyntaxBuilder defaults() {
        return new GateSyntaxBuilder().addDirectory("UI");
    }
}
