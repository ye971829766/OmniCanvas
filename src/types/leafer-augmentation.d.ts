import { App, UI, Leafer } from "leafer-ui";
import { IApp, IUI, ILeafer } from "@leafer-ui/interface";

declare module "leafer-ui" {
  interface App extends IApp {}
  interface UI extends IUI {}
  interface Leafer extends ILeafer {}
}

declare module "@leafer-ui/interface" {
  interface IApp {
    editor: any; // Type as any to prevent strict undefined and package duplication conflicts in all composables
    cursor?: string;
    updateCursor?: () => void;
    recordHistory?: () => void;
    recordHistoryDebounced?: () => void;
  }

  interface ILeafer {
    config?: any;
    zoom?: (value: any, duration?: number, point?: any, scale?: number) => void;
  }

  interface IUI {
    refId?: string;
    _pollingInterval?: any;
    generationStatus?: string;
    errorMessage?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    url?: string;
    aspectRatio?: string;
    quality?: string;
    size?: string;
    model?: string;
    prompt?: string;
    videoEl?: HTMLVideoElement;
    _shapeDown?: any;
    _shapeMove?: any;
    _shapeUp?: any;
    _markerDown?: any;
    _markerMove?: any;
    _markerUp?: any;
    _hasChildAddListener?: boolean;
    taskId?: string;
  }
}

declare global {
  interface Window {
    canvasApp?: App;
  }

  interface HTMLElement {
    _shapeDown?: any;
    _shapeMove?: any;
    _shapeUp?: any;
    _markerDown?: any;
    _markerMove?: any;
    _markerUp?: any;
  }
}
