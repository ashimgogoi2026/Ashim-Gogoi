import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Crop, 
  Download, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  Check, 
  Undo2, 
  Maximize2,
  Sparkles,
  Info,
  Lock,
  Unlock,
  Scaling,
  Plus,
  Minus,
  Crosshair,
  Move
} from 'lucide-react';
import { globalToast } from '../lib/toast';

interface ChatScreenshotCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  fileName: string;
  influencerName: string;
  platform: string;
  onSaveCrop: (croppedDataUrl: string, croppedBlob: Blob, newFileName: string) => void;
}

type AspectRatioPreset = 'free' | 'chat' | '1:1' | '4:5' | '16:9';

export const ChatScreenshotCropModal: React.FC<ChatScreenshotCropModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  fileName,
  influencerName,
  platform,
  onSaveCrop
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [aspectPreset, setAspectPreset] = useState<AspectRatioPreset>('free');
  const [isAspectLocked, setIsAspectLocked] = useState<boolean>(false);
  const [rotation, setRotation] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [isImageLoaded, setIsImageLoaded] = useState<boolean>(false);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Normalized crop box in percentage of displayed image (0 to 100)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 10,
    y: 10,
    w: 80,
    h: 80
  });

  // Dragging interaction state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragMode, setDragMode] = useState<
    'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'create' | null
  >(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initialBox: { x: number; y: number; w: number; h: number };
  }>({ clientX: 0, clientY: 0, initialBox: { x: 10, y: 10, w: 80, h: 80 } });

  // Initialize/Reset crop when image or modal opens
  useEffect(() => {
    if (isOpen) {
      setRotation(0);
      setZoom(1);
      setAspectPreset('free');
      setIsAspectLocked(false);
      setCropBox({ x: 10, y: 10, w: 80, h: 80 });
      setIsImageLoaded(false);
    }
  }, [isOpen, imageUrl]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    setIsImageLoaded(true);
    // Center a good starting chat crop: 68% width, 76% height
    setCropBox({ x: 16, y: 12, w: 68, h: 76 });
  };

  // Preset ratios handler
  const applyPreset = useCallback((preset: AspectRatioPreset) => {
    setAspectPreset(preset);
    if (!imgNaturalSize.width || !imgNaturalSize.height) return;

    if (preset === 'free') {
      setIsAspectLocked(false);
      return;
    }

    setIsAspectLocked(true);

    let targetRatio = 1;
    if (preset === 'chat') targetRatio = 9 / 16;
    else if (preset === '1:1') targetRatio = 1;
    else if (preset === '4:5') targetRatio = 4 / 5;
    else if (preset === '16:9') targetRatio = 16 / 9;

    // Convert natural aspect to displayed coordinate box
    const currentImgAspect = imgNaturalSize.width / imgNaturalSize.height;
    // Box in percentage dimensions: w% / h% * currentImgAspect = targetRatio
    let targetW = 60;
    let targetH = (targetW / targetRatio) * currentImgAspect;

    if (targetH > 85) {
      targetH = 85;
      targetW = targetH * targetRatio / currentImgAspect;
    }
    if (targetW > 85) {
      targetW = 85;
      targetH = (targetW / targetRatio) * currentImgAspect;
    }

    const newX = Math.max(0, (100 - targetW) / 2);
    const newY = Math.max(0, (100 - targetH) / 2);

    setCropBox({
      x: Number(newX.toFixed(2)),
      y: Number(newY.toFixed(2)),
      w: Number(targetW.toFixed(2)),
      h: Number(targetH.toFixed(2))
    });
  }, [imgNaturalSize]);

  // Scalable Cropping Area Functions
  // 1. Scale around box center by factor (e.g. 1.1 for +10%, 0.9 for -10%)
  const scaleCropAreaByFactor = useCallback((factor: number) => {
    setCropBox(prev => {
      const centerX = prev.x + prev.w / 2;
      const centerY = prev.y + prev.h / 2;

      let newW = prev.w * factor;
      let newH = prev.h * factor;

      const minDimension = 4;
      if (newW < minDimension || newH < minDimension) return prev;

      if (newW > 100) {
        const ratio = 100 / newW;
        newW = 100;
        newH = newH * ratio;
      }
      if (newH > 100) {
        const ratio = 100 / newH;
        newH = 100;
        newW = newW * ratio;
      }

      let newX = centerX - newW / 2;
      let newY = centerY - newH / 2;

      if (newX < 0) newX = 0;
      if (newY < 0) newY = 0;
      if (newX + newW > 100) newX = 100 - newW;
      if (newY + newH > 100) newY = 100 - newH;

      return {
        x: Number(newX.toFixed(2)),
        y: Number(newY.toFixed(2)),
        w: Number(newW.toFixed(2)),
        h: Number(newH.toFixed(2))
      };
    });
  }, []);

  // 2. Set direct scale percentage (10% to 100%)
  const setCropAreaDirectScale = useCallback((targetPercent: number) => {
    setCropBox(prev => {
      const currentMax = Math.max(prev.w, prev.h);
      if (currentMax === 0) return prev;
      const factor = targetPercent / currentMax;

      const centerX = prev.x + prev.w / 2;
      const centerY = prev.y + prev.h / 2;

      let newW = prev.w * factor;
      let newH = prev.h * factor;

      const minDimension = 4;
      if (newW < minDimension || newH < minDimension) return prev;

      if (newW > 100) {
        const ratio = 100 / newW;
        newW = 100;
        newH = newH * ratio;
      }
      if (newH > 100) {
        const ratio = 100 / newH;
        newH = 100;
        newW = newW * ratio;
      }

      let newX = centerX - newW / 2;
      let newY = centerY - newH / 2;

      if (newX < 0) newX = 0;
      if (newY < 0) newY = 0;
      if (newX + newW > 100) newX = 100 - newW;
      if (newY + newH > 100) newY = 100 - newH;

      return {
        x: Number(newX.toFixed(2)),
        y: Number(newY.toFixed(2)),
        w: Number(newW.toFixed(2)),
        h: Number(newH.toFixed(2))
      };
    });
  }, []);

  // 3. Center crop area on image
  const centerCropBox = useCallback(() => {
    setCropBox(prev => ({
      x: Number(Math.max(0, (100 - prev.w) / 2).toFixed(2)),
      y: Number(Math.max(0, (100 - prev.h) / 2).toFixed(2)),
      w: prev.w,
      h: prev.h
    }));
  }, []);

  // 4. Adjust width or height by exact pixels
  const handlePixelDimensionChange = (dimension: 'w' | 'h', val: number) => {
    if (!imgNaturalSize.width || !imgNaturalSize.height || val < 20) return;
    if (dimension === 'w') {
      const targetW = Math.min(100, Math.max(5, (val / imgNaturalSize.width) * 100));
      setCropBox(prev => {
        let targetH = prev.h;
        if (isAspectLocked) {
          targetH = (targetW / (prev.w / prev.h));
          if (targetH > 100) targetH = 100;
        }
        return {
          ...prev,
          w: Number(targetW.toFixed(2)),
          h: Number(targetH.toFixed(2)),
          x: Math.min(prev.x, 100 - targetW),
          y: Math.min(prev.y, 100 - targetH)
        };
      });
    } else {
      const targetH = Math.min(100, Math.max(5, (val / imgNaturalSize.height) * 100));
      setCropBox(prev => {
        let targetW = prev.w;
        if (isAspectLocked) {
          targetW = (targetH * (prev.w / prev.h));
          if (targetW > 100) targetW = 100;
        }
        return {
          ...prev,
          h: Number(targetH.toFixed(2)),
          w: Number(targetW.toFixed(2)),
          x: Math.min(prev.x, 100 - targetW),
          y: Math.min(prev.y, 100 - targetH)
        };
      });
    }
  };

  // Pointer Down on Handles or Move Overlay
  const startDrag = (
    mode: 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'create',
    e: React.PointerEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragMode(mode);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialBox: { ...cropBox }
    };
  };

  // Pointer Move during Drag
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging || !dragMode || !imgRef.current) return;

    const imgRect = imgRef.current.getBoundingClientRect();
    if (imgRect.width === 0 || imgRect.height === 0) return;

    // Handle "create" / redrawing new selection box
    if (dragMode === 'create') {
      const curX = Math.min(100, Math.max(0, ((e.clientX - imgRect.left) / imgRect.width) * 100));
      const curY = Math.min(100, Math.max(0, ((e.clientY - imgRect.top) / imgRect.height) * 100));

      const startX = Math.min(100, Math.max(0, ((dragStartRef.current.clientX - imgRect.left) / imgRect.width) * 100));
      const startY = Math.min(100, Math.max(0, ((dragStartRef.current.clientY - imgRect.top) / imgRect.height) * 100));

      const left = Math.min(startX, curX);
      const top = Math.min(startY, curY);
      const width = Math.max(4, Math.abs(curX - startX));
      const height = Math.max(4, Math.abs(curY - startY));

      setCropBox({
        x: Number(left.toFixed(2)),
        y: Number(top.toFixed(2)),
        w: Number(width.toFixed(2)),
        h: Number(height.toFixed(2))
      });
      return;
    }

    const deltaXPercent = ((e.clientX - dragStartRef.current.clientX) / imgRect.width) * 100;
    const deltaYPercent = ((e.clientY - dragStartRef.current.clientY) / imgRect.height) * 100;

    const { initialBox } = dragStartRef.current;
    let newX = initialBox.x;
    let newY = initialBox.y;
    let newW = initialBox.w;
    let newH = initialBox.h;

    const minSize = 4; // Minimum 4% width/height

    if (dragMode === 'move') {
      newX = Math.min(Math.max(0, initialBox.x + deltaXPercent), 100 - initialBox.w);
      newY = Math.min(Math.max(0, initialBox.y + deltaYPercent), 100 - initialBox.h);
    } else {
      const initialAspect = initialBox.w / initialBox.h;

      // Resizing with aspect ratio lock enforcement when dragging corners
      if (isAspectLocked && ['nw', 'ne', 'se', 'sw'].includes(dragMode)) {
        let scaleDelta = deltaXPercent;
        if (dragMode === 'se') {
          newW = Math.max(minSize, Math.min(100 - initialBox.x, initialBox.w + scaleDelta));
          newH = Math.max(minSize, Math.min(100 - initialBox.y, newW / initialAspect));
        } else if (dragMode === 'sw') {
          newW = Math.max(minSize, Math.min(initialBox.x + initialBox.w, initialBox.w - scaleDelta));
          newX = initialBox.x + (initialBox.w - newW);
          newH = Math.max(minSize, Math.min(100 - initialBox.y, newW / initialAspect));
        } else if (dragMode === 'ne') {
          newW = Math.max(minSize, Math.min(100 - initialBox.x, initialBox.w + scaleDelta));
          newH = Math.max(minSize, Math.min(initialBox.y + initialBox.h, newW / initialAspect));
          newY = initialBox.y + (initialBox.h - newH);
        } else if (dragMode === 'nw') {
          newW = Math.max(minSize, Math.min(initialBox.x + initialBox.w, initialBox.w - scaleDelta));
          newX = initialBox.x + (initialBox.w - newW);
          newH = Math.max(minSize, Math.min(initialBox.y + initialBox.h, newW / initialAspect));
          newY = initialBox.y + (initialBox.h - newH);
        }
      } else {
        // Freeform corner and edge resizing
        if (dragMode.includes('w')) {
          const potentialW = initialBox.w - deltaXPercent;
          if (potentialW >= minSize && initialBox.x + deltaXPercent >= 0) {
            newX = initialBox.x + deltaXPercent;
            newW = potentialW;
          }
        }
        if (dragMode.includes('e')) {
          const potentialW = initialBox.w + deltaXPercent;
          if (potentialW >= minSize && initialBox.x + potentialW <= 100) {
            newW = potentialW;
          }
        }
        if (dragMode.includes('n')) {
          const potentialH = initialBox.h - deltaYPercent;
          if (potentialH >= minSize && initialBox.y + deltaYPercent >= 0) {
            newY = initialBox.y + deltaYPercent;
            newH = potentialH;
          }
        }
        if (dragMode.includes('s')) {
          const potentialH = initialBox.h + deltaYPercent;
          if (potentialH >= minSize && initialBox.y + potentialH <= 100) {
            newH = potentialH;
          }
        }
      }
    }

    setCropBox({
      x: Math.max(0, Math.min(100 - minSize, newX)),
      y: Math.max(0, Math.min(100 - minSize, newY)),
      w: Math.max(minSize, Math.min(100 - newX, newW)),
      h: Math.max(minSize, Math.min(100 - newY, newH))
    });
  }, [isDragging, dragMode, isAspectLocked]);

  // Pointer Up
  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setDragMode(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  // Calculate actual pixel dimensions for display
  const pixelCrop = {
    x: Math.round((cropBox.x / 100) * imgNaturalSize.width),
    y: Math.round((cropBox.y / 100) * imgNaturalSize.height),
    w: Math.round((cropBox.w / 100) * imgNaturalSize.width),
    h: Math.round((cropBox.h / 100) * imgNaturalSize.height)
  };

  // Current percentage scale of selection area (relative to image max dimension)
  const currentScalePercent = Math.round(Math.max(cropBox.w, cropBox.h));

  // Perform canvas crop and generate Blob + DataURL
  const generateCroppedImage = async (): Promise<{ blob: Blob; dataUrl: string; fileName: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        const rad = (rotation * Math.PI) / 180;
        const sin = Math.abs(Math.sin(rad));
        const cos = Math.abs(Math.cos(rad));
        
        if (rotation % 360 === 0) {
          canvas.width = Math.max(1, pixelCrop.w);
          canvas.height = Math.max(1, pixelCrop.h);
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas context unavailable'));

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(
            img,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.w,
            pixelCrop.h,
            0,
            0,
            canvas.width,
            canvas.height
          );
        } else {
          const rotatedWidth = Math.floor(img.naturalWidth * cos + img.naturalHeight * sin);
          const rotatedHeight = Math.floor(img.naturalWidth * sin + img.naturalHeight * cos);
          
          const rotCanvas = document.createElement('canvas');
          rotCanvas.width = rotatedWidth;
          rotCanvas.height = rotatedHeight;
          const rotCtx = rotCanvas.getContext('2d');
          if (!rotCtx) return reject(new Error('Canvas context unavailable'));

          rotCtx.translate(rotatedWidth / 2, rotatedHeight / 2);
          rotCtx.rotate(rad);
          rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

          canvas.width = Math.max(1, pixelCrop.w);
          canvas.height = Math.max(1, pixelCrop.h);
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas context unavailable'));

          ctx.drawImage(
            rotCanvas,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.w,
            pixelCrop.h,
            0,
            0,
            canvas.width,
            canvas.height
          );
        }

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Failed to generate image blob'));
          const dataUrl = canvas.toDataURL('image/png', 0.98);
          
          const cleanName = (influencerName || 'Creator').replace(/[^a-zA-Z0-9_-]/g, '_');
          const now = new Date();
          const dateTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
          const newFileName = `FutureCreator_${cleanName}_${platform}_Cropped_${dateTag}.png`;

          resolve({ blob, dataUrl, fileName: newFileName });
        }, 'image/png', 0.98);
      };
      img.onerror = () => reject(new Error('Failed to load source image for cropping'));
      img.src = imageUrl;
    });
  };

  // Handler: Save cropped screenshot directly to creator profile
  const handleApplyCrop = async () => {
    try {
      const { blob, dataUrl, fileName: newFileName } = await generateCroppedImage();

      onSaveCrop(dataUrl, blob, newFileName);
      globalToast.success(`✂️ Cropped screenshot saved to creator profile!`);
      onClose();
    } catch (err: any) {
      console.error('[Crop Error]', err);
      globalToast.error(`Crop failed: ${err.message || 'Unknown error'}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden my-auto flex flex-col text-slate-100 max-h-[96vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/30 border border-indigo-500/40 rounded-xl text-indigo-400">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm md:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                  <span>Scalable Chat Screenshot Cropper</span>
                  <span className="text-[10px] uppercase font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                    {platform}
                  </span>
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Scale the selection area dynamically with the slider, presets, or drag handles to frame chat messages crisply and save to creator profile.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Close Cropper"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Row 1: Aspect Ratio Presets & Display Controls */}
        <div className="px-5 py-2.5 bg-slate-800/90 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Presets:
            </span>
            <button
              type="button"
              onClick={() => applyPreset('free')}
              className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                aspectPreset === 'free' && !isAspectLocked
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              Freeform
            </button>
            <button
              type="button"
              onClick={() => applyPreset('chat')}
              className={`px-2.5 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer ${
                aspectPreset === 'chat'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
              title="9:16 Tall Chat Column (WhatsApp / Instagram thread)"
            >
              <span>📱 Chat Column (9:16)</span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset('1:1')}
              className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${
                aspectPreset === '1:1'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              1:1
            </button>
            <button
              type="button"
              onClick={() => applyPreset('4:5')}
              className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${
                aspectPreset === '4:5'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              4:5
            </button>
            <button
              type="button"
              onClick={() => applyPreset('16:9')}
              className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${
                aspectPreset === '16:9'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              16:9
            </button>
            <button
              type="button"
              onClick={() => {
                setAspectPreset('free');
                setIsAspectLocked(false);
                setCropBox({ x: 0, y: 0, w: 100, h: 100 });
              }}
              className="px-2.5 py-1 rounded-md font-bold bg-slate-700 hover:bg-slate-600 text-slate-300 transition flex items-center gap-1 cursor-pointer"
              title="Reset crop to full image"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Full Image</span>
            </button>
          </div>

          {/* Tools: Aspect Lock, Zoom & Rotate */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Lock/Unlock Aspect Ratio */}
            <button
              type="button"
              onClick={() => setIsAspectLocked(prev => !prev)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                isAspectLocked
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
              title="Lock or unlock current aspect ratio when scaling or dragging"
            >
              {isAspectLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>{isAspectLocked ? 'Aspect Locked' : 'Aspect Free'}</span>
            </button>

            {/* Zoom Controls */}
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setZoom(prev => Math.max(0.6, Number((prev - 0.15).toFixed(2))))}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition cursor-pointer"
                title="Zoom Out Image"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-[10px] font-mono text-slate-300 min-w-[38px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom(prev => Math.min(2.5, Number((prev + 0.15).toFixed(2))))}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition cursor-pointer"
                title="Zoom In Image"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Rotate */}
            <button
              type="button"
              onClick={() => setRotation(prev => (prev + 90) % 360)}
              className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition flex items-center gap-1 cursor-pointer"
              title="Rotate 90° Clockwise"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold">Rotate</span>
            </button>
          </div>
        </div>

        {/* Toolbar Row 2: DEDICATED SCALABLE CROPPING AREA SELECTION CONTROLS */}
        <div className="px-5 py-2.5 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-b border-indigo-900/40 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          {/* Scalable Crop Area Slider & Increment Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-extrabold text-indigo-300 flex items-center gap-1.5">
              <Scaling className="w-4 h-4 text-purple-400" />
              <span>Selection Scale:</span>
            </span>

            {/* Step Shrink */}
            <button
              type="button"
              onClick={() => scaleCropAreaByFactor(0.92)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition cursor-pointer flex items-center justify-center"
              title="Shrink Selection Area (-8%)"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            {/* Dynamic Scale Range Slider */}
            <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 px-2.5 py-1 rounded-lg">
              <input
                type="range"
                min="10"
                max="100"
                step="1"
                value={currentScalePercent}
                onChange={(e) => setCropAreaDirectScale(Number(e.target.value))}
                className="w-24 sm:w-36 accent-indigo-500 cursor-pointer"
                title="Drag to dynamically scale crop box size"
              />
              <span className="font-mono text-xs font-bold text-indigo-300 min-w-[36px] text-right">
                {currentScalePercent}%
              </span>
            </div>

            {/* Step Enlarge */}
            <button
              type="button"
              onClick={() => scaleCropAreaByFactor(1.08)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition cursor-pointer flex items-center justify-center"
              title="Enlarge Selection Area (+8%)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {/* Quick Scale Presets */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCropAreaDirectScale(30)}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Scale to 30% (Compact single message / bubble)"
              >
                30%
              </button>
              <button
                type="button"
                onClick={() => setCropAreaDirectScale(50)}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Scale to 50% (Half thread)"
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => setCropAreaDirectScale(75)}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Scale to 75% (Focused chat thread)"
              >
                75%
              </button>
              <button
                type="button"
                onClick={() => setCropAreaDirectScale(90)}
                className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Scale to 90% (Wide area)"
              >
                90%
              </button>
            </div>

            {/* Center Area Button */}
            <button
              type="button"
              onClick={centerCropBox}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-bold border border-slate-700 transition flex items-center gap-1 cursor-pointer"
              title="Center selection area on image"
            >
              <Crosshair className="w-3 h-3 text-indigo-400" />
              <span>Center</span>
            </button>
          </div>

          {/* Precise Pixel Inputs */}
          {isImageLoaded && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 px-2.5 py-1 rounded-lg">
              <span className="text-[11px] font-mono text-slate-400">Crop:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="20"
                  max={imgNaturalSize.width}
                  value={pixelCrop.w}
                  onChange={(e) => handlePixelDimensionChange('w', Number(e.target.value))}
                  className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-indigo-300 text-center focus:outline-hidden focus:border-indigo-500"
                  title="Width in pixels"
                />
                <span className="text-slate-500 font-mono">×</span>
                <input
                  type="number"
                  min="20"
                  max={imgNaturalSize.height}
                  value={pixelCrop.h}
                  onChange={(e) => handlePixelDimensionChange('h', Number(e.target.value))}
                  className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-indigo-300 text-center focus:outline-hidden focus:border-indigo-500"
                  title="Height in pixels"
                />
                <span className="text-[10px] text-slate-400 font-mono">px</span>
              </div>
            </div>
          )}
        </div>

        {/* Interactive Workspace */}
        <div 
          ref={containerRef}
          className="relative flex-1 min-h-[380px] max-h-[56vh] bg-slate-950 flex items-center justify-center overflow-auto p-4 select-none"
        >
          <div 
            className="relative inline-block transition-transform duration-100 origin-center"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`
            }}
          >
            {/* Image */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Screenshot to crop"
              onLoad={handleImageLoad}
              className="max-h-[50vh] max-w-full object-contain pointer-events-none rounded shadow-md block border border-slate-800"
              draggable={false}
            />

            {/* Dark Mask & Crop Box Overlay (Rendered once image is loaded) */}
            {isImageLoaded && (
              <div className="absolute inset-0">
                {/* 4 dark clickable masks around the crop box to allow redrawing/creating new selection */}
                {/* Top mask */}
                <div 
                  className="absolute bg-slate-950/70 cursor-crosshair"
                  style={{ top: 0, left: 0, right: 0, height: `${cropBox.y}%` }}
                  onPointerDown={(e) => startDrag('create', e)}
                  title="Click and drag to draw a new selection area"
                />
                {/* Bottom mask */}
                <div 
                  className="absolute bg-slate-950/70 cursor-crosshair"
                  style={{ top: `${cropBox.y + cropBox.h}%`, left: 0, right: 0, bottom: 0 }}
                  onPointerDown={(e) => startDrag('create', e)}
                  title="Click and drag to draw a new selection area"
                />
                {/* Left mask */}
                <div 
                  className="absolute bg-slate-950/70 cursor-crosshair"
                  style={{ 
                    top: `${cropBox.y}%`, 
                    left: 0, 
                    width: `${cropBox.x}%`, 
                    height: `${cropBox.h}%` 
                  }}
                  onPointerDown={(e) => startDrag('create', e)}
                  title="Click and drag to draw a new selection area"
                />
                {/* Right mask */}
                <div 
                  className="absolute bg-slate-950/70 cursor-crosshair"
                  style={{ 
                    top: `${cropBox.y}%`, 
                    left: `${cropBox.x + cropBox.w}%`, 
                    right: 0, 
                    height: `${cropBox.h}%` 
                  }}
                  onPointerDown={(e) => startDrag('create', e)}
                  title="Click and drag to draw a new selection area"
                />

                {/* Active Scalable Crop Box */}
                <div
                  className="absolute border-2 border-indigo-400 cursor-move shadow-[0_0_0_1px_rgba(255,255,255,0.4)]"
                  style={{
                    top: `${cropBox.y}%`,
                    left: `${cropBox.x}%`,
                    width: `${cropBox.w}%`,
                    height: `${cropBox.h}%`
                  }}
                  onPointerDown={(e) => startDrag('move', e)}
                  title="Drag inside to move selection"
                >
                  {/* Grid Lines (Rule of Thirds) */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-35">
                    <div className="border-r border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-b border-white" />
                    <div className="border-r border-white" />
                    <div className="border-r border-white" />
                    <div />
                  </div>

                  {/* Dimension & Scale pill attached to crop box */}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-indigo-400 text-indigo-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap flex items-center gap-1.5">
                    <span>{pixelCrop.w} × {pixelCrop.h} px</span>
                    <span className="text-purple-300 bg-purple-950/80 px-1.5 py-0.2 rounded-full border border-purple-800 text-[9px]">
                      {currentScalePercent}% Scale
                    </span>
                  </div>

                  {/* 8 Resize Handles */}
                  {/* Corners */}
                  <div
                    onPointerDown={(e) => startDrag('nw', e)}
                    className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-indigo-600 rounded-sm cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                    title="Resize corner"
                  />
                  <div
                    onPointerDown={(e) => startDrag('ne', e)}
                    className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-indigo-600 rounded-sm cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                    title="Resize corner"
                  />
                  <div
                    onPointerDown={(e) => startDrag('se', e)}
                    className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-indigo-600 rounded-sm cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                    title="Resize corner"
                  />
                  <div
                    onPointerDown={(e) => startDrag('sw', e)}
                    className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-indigo-600 rounded-sm cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                    title="Resize corner"
                  />

                  {/* Edges */}
                  <div
                    onPointerDown={(e) => startDrag('n', e)}
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-white/90 border border-indigo-600 rounded-xs cursor-ns-resize shadow-sm hover:scale-110 transition-transform"
                    title="Resize top"
                  />
                  <div
                    onPointerDown={(e) => startDrag('s', e)}
                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-white/90 border border-indigo-600 rounded-xs cursor-ns-resize shadow-sm hover:scale-110 transition-transform"
                    title="Resize bottom"
                  />
                  <div
                    onPointerDown={(e) => startDrag('w', e)}
                    className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-8 bg-white/90 border border-indigo-600 rounded-xs cursor-ew-resize shadow-sm hover:scale-110 transition-transform"
                    title="Resize left"
                  />
                  <div
                    onPointerDown={(e) => startDrag('e', e)}
                    className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-8 bg-white/90 border border-indigo-600 rounded-xs cursor-ew-resize shadow-sm hover:scale-110 transition-transform"
                    title="Resize right"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer info & Actions */}
        <div className="px-5 py-3.5 bg-slate-900 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              Use the <strong>Selection Scale</strong> slider above, step buttons (+ / -), or drag the white handles to scale the crop area. Click anywhere outside to draw a new area.
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyCrop}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white font-extrabold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>✂️ Crop &amp; Save to Profile</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
