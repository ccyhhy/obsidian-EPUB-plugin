import * as React from "react";
import { useEffect, useRef, useState, useCallback } from 'react';
import { WorkspaceLeaf } from 'obsidian';
import { ReactReader, ReactReaderStyle, type IReactReaderStyle } from 'react-reader';
import type { Contents, Rendition } from 'epubjs';
import useLocalStorageState from 'use-local-storage-state';

// ========== 悬浮工具条样式 ==========
const TOOLBAR_STYLE = `
.epub-selection-toolbar {
  position: absolute;
  z-index: 999999;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,.2);
  padding: 6px 8px;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
}

.epub-selection-toolbar button {
  background: var(--interactive-normal);
  color: var(--text-normal);
  border: none;
  border-radius: 6px;
  padding: 4px 6px;
  cursor: pointer;
}

.epub-selection-toolbar button:hover {
  background: var(--interactive-hover);
}
`;

// 把样式注入页面
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
// 创建工具条
const createToolbar = () => {
  if (toolbarRef.current) return toolbarRef.current;

  injectToolbarStyle();

  const bar = document.createElement("div");
  bar.className = "epub-selection-toolbar";
  bar.style.display = "none";

  bar.innerHTML = `
    <button id="epub-copy-link">🔗 复制链接</button>
    <button id="epub-highlight">✨ 高亮</button>
  `;

  document.body.appendChild(bar);
  toolbarRef.current = bar;
  return bar;
};
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

  const updateFontSize = useCallback((size: number) => {
    renditionRef.current?.themes.fontSize(`${size}%`);
  }, []);

  useEffect(() => {
    updateFontSize(fontSize);
  }, [fontSize, updateFontSize]);

	// ============================================================
  // [ADD] 核心修改：将 React 内部状态暴露给 Obsidian View 实例
  // ============================================================
  useEffect(() => {
    // 这里的 leaf.view 就是 Obsidian 的视图实例
    const viewInstance = leaf.view as any;

    // 1. 暴露 Getter：获取当前 CFI
    viewInstance.getCurrentCfi = () => {
  // 兼容不同版本的类型定义：DisplayedLocation 可能未声明 start
  const loc = renditionRef.current?.currentLocation() as any;
  return (loc?.start?.cfi ?? (typeof location === 'string' ? location : undefined)) as (string | undefined);
};


    // 2. 暴露 Setter：跳转到 CFI
    viewInstance.jumpToCfi = (cfi: string) => {
      console.log("EpubReader: Jumping to", cfi);
      // 直接调用 react-reader 的状态更新函数，触发重新渲染
      setLocation(cfi);
    };

    // 清理函数
    return () => {
      delete viewInstance.getCurrentCfi;
      delete viewInstance.jumpToCfi;
    };
  }, [leaf, setLocation, location]); // 依赖于 setLocation 确保能调用最新的状态更新器
  // ============================================================
  useEffect(() => {
    const handleResize = () => {
      const epubContainer = leaf.view.containerEl.querySelector('div.epub-container');
      if (!epubContainer) return;

      const viewContentStyle = getComputedStyle(epubContainer.parentElement!);
      renditionRef.current?.resize(
        parseFloat(viewContentStyle.width),
        parseFloat(viewContentStyle.height)
      );
    };

    leaf.view.app.workspace.on('resize', handleResize);
	  // === 监听文本选择，显示浮层工具条 ===
const showToolbar = (x: number, y: number) => {
  const bar = createToolbar();
  bar.style.display = "flex";
  bar.style.left = `${x}px`;
  bar.style.top = `${y - 40}px`; // 选区上方
};

const hideToolbar = () => {
  toolbarRef.current?.setAttribute("style", "display:none");
};

const onSelectionChange = () => {
  const sel = window.getSelection();
  const text = sel?.toString()?.trim();

  if (!text) {
    hideToolbar();
    return;
  }

  const range = sel?.getRangeAt(0);
  const rect = range?.getBoundingClientRect();

  if (rect) {
    showToolbar(rect.left + rect.width / 2, rect.top);
  }
};

document.addEventListener("selectionchange", onSelectionChange);

// 清理
return () => {
  document.removeEventListener("selectionchange", onSelectionChange);
};
const bar = createToolbar();

bar.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const sel = window.getSelection();
  const text = sel?.toString()?.trim();

  const loc = renditionRef.current?.currentLocation() as any;
  const cfi = loc?.start?.cfi ?? location;

  if (!cfi || !text) {
    new Notice("请先选中文本");
    return;
  }

  const file = leaf.view.file;
  const fid = file.id;

  // === 复制【双向链接 + 可读文字】 ===
  if (target.id === "epub-copy-link") {
    const bookLink = `[[${file.path}]]`;

    const jumpLink =
      `[跳回原文](obsidian://epub-jump?fid=${encodeURIComponent(fid)}` +
      `&cfi=${encodeURIComponent(cfi)}` +
      `&text=${encodeURIComponent(text)})`;

    const clipboardText =
      `📖 书籍：${bookLink}\n` +
      `📍 位置：${jumpLink}\n` +
      `> ${text}`;

    await navigator.clipboard.writeText(clipboardText);
    new Notice("已复制双向链接摘录");
  }

  // === 高亮 ===
  if (target.id === "epub-highlight") {
    renditionRef.current?.annotations.highlight(cfi, {}, () => {});
    new Notice("已高亮");
  }
});

    return () => leaf.view.app.workspace.off('resize', handleResize);
  }, [leaf]);

  const readerStyles = isDarkMode ? darkReaderTheme : lightReaderTheme;

  return (
    <div style={{ height: "100vh" }}>
      <div style={{ padding: '10px' }}>
        <label htmlFor="fontSizeSlider">Adjust Font Size: </label>
        <input
          id="fontSizeSlider"
          type="range"
          min="80"
          max="160"
          value={fontSize}
          onChange={e => setFontSize(parseInt(e.target.value))}
        />
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
            const body = contents.window.document.body;
            body.oncontextmenu = () => false;
          });
          updateTheme(rendition, isDarkMode ? 'dark' : 'light');
          updateFontSize(fontSize);
        }}
        epubOptions={scrolled ? {
          allowPopups: true,
          flow: "scrolled",
          manager: "continuous",
        } : undefined}
        readerStyles={readerStyles}
      />
    </div>
  );
};

const lightReaderTheme: IReactReaderStyle = {
  ...ReactReaderStyle,
  readerArea: {
    ...ReactReaderStyle.readerArea,
    transition: undefined,
  },
};

const darkReaderTheme: IReactReaderStyle = {
  ...ReactReaderStyle,
  arrow: {
    ...ReactReaderStyle.arrow,
    color: 'white',
  },
  arrowHover: {
    ...ReactReaderStyle.arrowHover,
    color: '#ccc',
  },
  readerArea: {
    ...ReactReaderStyle.readerArea,
    backgroundColor: '#000',
    transition: undefined,
  },
  titleArea: {
    ...ReactReaderStyle.titleArea,
    color: '#ccc',
  },
  tocArea: {
    ...ReactReaderStyle.tocArea,
    background: '#111',
  },
  tocButtonExpanded: {
    ...ReactReaderStyle.tocButtonExpanded,
    background: '#222',
  },
  tocButtonBar: {
    ...ReactReaderStyle.tocButtonBar,
    background: '#fff',
  },
  tocButton: {
    ...ReactReaderStyle.tocButton,
    color: 'white',
  },
};
