import * as React from "react";
import { useEffect, useRef, useState, useCallback } from 'react';
import { WorkspaceLeaf } from 'obsidian';
import { ReactReader, ReactReaderStyle, type IReactReaderStyle } from 'react-reader';
import type { Contents, Rendition } from 'epubjs';
import useLocalStorageState from 'use-local-storage-state';

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
