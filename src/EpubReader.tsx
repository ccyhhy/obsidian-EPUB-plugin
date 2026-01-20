import * as React from "react";
import { useEffect, useRef, useState, useCallback } from 'react';
import { WorkspaceLeaf, Notice, FileView, TFile } from 'obsidian';
import { ReactReader, ReactReaderStyle, type IReactReaderStyle } from 'react-reader';
import type { Contents, Rendition } from 'epubjs';
import useLocalStorageState from 'use-local-storage-state';

const TOOLBAR_STYLE = `
.epub-selection-toolbar {
  position: absolute;
  z-index: 999999;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,.3);
  padding: 6px 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.epub-selection-toolbar button {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
}
.epub-selection-toolbar button:hover {
  opacity: 0.8;
}
`;

const injectToolbarStyle = () => {
  if (document.getElementById("epub-toolbar-style")) return;
  const style = document.createElement("style");
  style.id = "epub-toolbar-style";
  style.innerHTML = TOOLBAR_STYLE;
  document.head.appendChild(style);
};

export const EpubReader = ({ contents, title, scrolled, tocOffset, tocBottomOffset, leaf }: {
  contents: ArrayBuffer;
  title: string;
  scrolled: boolean;
  tocOffset: number;
  tocBottomOffset: number;
  leaf: WorkspaceLeaf;
}) => {
  const [location, setLocation] = useLocalStorageState<string | number>(`epub-${title}`, { defaultValue: 0 });
  const renditionRef = useRef<Rendition | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null); // [修复] 定义缺失的引用
  const [fontSize, setFontSize] = useState(100); 

  const isDarkMode = document.body.classList.contains('theme-dark');

  const locationChanged = useCallback((epubcifi: string | number) => {
    setLocation(epubcifi);
  }, [setLocation]);

  const updateTheme = useCallback((rendition: Rendition, theme: 'light' | 'dark') => {
    const themes = rendition.themes;
    themes.override('color', theme === 'dark' ? '#fff' : '#000');
    themes.override('background', theme === 'dark' ? '#000' : '#fff');
  }, []);

  const createToolbar = () => {
    if (toolbarRef.current) return toolbarRef.current;
    injectToolbarStyle();
    const bar = document.createElement("div");
    bar.className = "epub-selection-toolbar";
    bar.style.display = "none";
    bar.innerHTML = `<button id="epub-copy-link">🔗 复制跳转链接</button><button id="epub-highlight">✨ 高亮</button>`;
    document.body.appendChild(bar);
    toolbarRef.current = bar;
    return bar;
  };

  // 暴露接口给 Obsidian View
  useEffect(() => {
    const viewInstance = leaf.view as any;
    viewInstance.getCurrentCfi = () => {
      const loc = renditionRef.current?.currentLocation() as any;
      return (loc?.start?.cfi ?? (typeof location === 'string' ? location : undefined)) as (string | undefined);
    };
    viewInstance.jumpToCfi = (cfi: string) => {
      setLocation(cfi);
    };
    return () => {
      delete viewInstance.getCurrentCfi;
      delete viewInstance.jumpToCfi;
    };
  }, [leaf, setLocation, location]);

  useEffect(() => {
    const handleResize = () => {
      const epubContainer = leaf.view.containerEl.querySelector('div.epub-container');
      if (!epubContainer) return;
      const viewContentStyle = getComputedStyle(epubContainer.parentElement!);
      renditionRef.current?.resize(parseFloat(viewContentStyle.width), parseFloat(viewContentStyle.height));
    };

    leaf.view.app.workspace.on('resize', handleResize);

    const onSelectionChange = () => {
      const sel = window.getSelection();
      const text = sel?.toString()?.trim();
      if (!text) {
        if (toolbarRef.current) toolbarRef.current.style.display = "none";
        return;
      }
      const range = sel?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      if (rect) {
        const bar = createToolbar();
        bar.style.display = "flex";
        bar.style.left = `${rect.left + rect.width / 2}px`;
        bar.style.top = `${rect.top - 45}px`;
      }
    };

    document.addEventListener("selectionchange", onSelectionChange);

    const bar = createToolbar();
    const handleToolbarClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const sel = window.getSelection();
      const text = sel?.toString()?.trim();
      const loc = renditionRef.current?.currentLocation() as any;
      const cfi = loc?.start?.cfi ?? location;

      if (!cfi || !text) {
        new Notice("请先选中文本");
        return;
      }

      const fileView = leaf.view as FileView;
      const file = fileView.file;
      if (!(file instanceof TFile)) return;

      if (target.id === "epub-copy-link") {
        const jumpLink = `obsidian://epub-jump?file=${encodeURIComponent(file.path)}&cfi=${encodeURIComponent(cfi)}`;
        const clipboardText = `📖 书籍：[[${file.path}]]\n📍 位置：[跳回原文](${jumpLink})\n> ${text}`;
        await navigator.clipboard.writeText(clipboardText);
        new Notice("已复制摘录及双向跳转链接");
      }

      if (target.id === "epub-highlight") {
        renditionRef.current?.annotations.highlight(cfi, {}, () => {});
        new Notice("已在当前页面高亮（临时）");
      }
    };

    bar.addEventListener("click", handleToolbarClick);

    return () => {
      leaf.view.app.workspace.off('resize', handleResize);
      document.removeEventListener("selectionchange", onSelectionChange);
      bar.removeEventListener("click", handleToolbarClick);
    };
  }, [leaf, location]);

  const readerStyles = isDarkMode ? darkReaderTheme : lightReaderTheme;

  return (
    <div style={{ height: "100vh", position: "relative" }}>
      <div style={{ padding: '8px', borderBottom: '1px solid var(--background-modifier-border)' }}>
        <label style={{ fontSize: '12px' }}>字号: </label>
        <input type="range" min="80" max="180" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} />
      </div>
      <ReactReader
        title={title}
        showToc={true}
        location={location}
        locationChanged={locationChanged}
        swipeable={false}
        url={contents}
        getRendition={(rendition: Rendition) => {
          renditionRef.current = rendition;
          rendition.hooks.content.register((contents: Contents) => {
            contents.window.document.body.oncontextmenu = () => false;
          });
          updateTheme(rendition, isDarkMode ? 'dark' : 'light');
          rendition.themes.fontSize(`${fontSize}%`);
        }}
        epubOptions={scrolled ? { allowPopups: true, flow: "scrolled", manager: "continuous" } : undefined}
        readerStyles={readerStyles}
      />
    </div>
  );
};

const lightReaderTheme: IReactReaderStyle = { ...ReactReaderStyle, readerArea: { ...ReactReaderStyle.readerArea, transition: undefined } };
const darkReaderTheme: IReactReaderStyle = {
  ...ReactReaderStyle,
  arrow: { ...ReactReaderStyle.arrow, color: 'white' },
  arrowHover: { ...ReactReaderStyle.arrowHover, color: '#ccc' },
  readerArea: { ...ReactReaderStyle.readerArea, backgroundColor: '#000', transition: undefined },
  titleArea: { ...ReactReaderStyle.titleArea, color: '#ccc' },
  tocArea: { ...ReactReaderStyle.tocArea, background: '#111' },
  tocButtonExpanded: { ...ReactReaderStyle.tocButtonExpanded, background: '#222' },
  tocButtonBar: { ...ReactReaderStyle.tocButtonBar, background: '#fff' },
  tocButton: { ...ReactReaderStyle.tocButton, color: 'white' },
};
