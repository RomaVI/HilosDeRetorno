"use client";

import MapLibreGL, { type PopupOptions, type MarkerOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./mapcn-layer-markers.css";
import {
    createContext,
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useId,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X, Minus, Plus, Locate, Maximize, Loader2 } from "lucide-react";

function cn(...inputs: Array<string | false | null | undefined>) {
    return inputs.filter(Boolean).join(" ");
}

const defaultStyles = {
    dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

type Theme = "light" | "dark";

function getDocumentTheme(): Theme | null {
    if (typeof document === "undefined") return null;
    if (document.documentElement.classList.contains("dark")) return "dark";
    if (document.documentElement.classList.contains("light")) return "light";
    return null;
}

function getSystemTheme(): Theme {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function useResolvedTheme(themeProp?: "light" | "dark"): Theme {
    const [detectedTheme, setDetectedTheme] = useState<Theme>(
        () => getDocumentTheme() ?? getSystemTheme(),
    );

    useEffect(() => {
        if (themeProp) return;

        const observer = new MutationObserver(() => {
            const docTheme = getDocumentTheme();
            if (docTheme) {
                setDetectedTheme(docTheme);
            }
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleSystemChange = (e: MediaQueryListEvent) => {
            if (!getDocumentTheme()) {
                setDetectedTheme(e.matches ? "dark" : "light");
            }
        };
        mediaQuery.addEventListener("change", handleSystemChange);

        return () => {
            observer.disconnect();
            mediaQuery.removeEventListener("change", handleSystemChange);
        };
    }, [themeProp]);

    return themeProp ?? detectedTheme;
}

type MapContextValue = {
    map: MapLibreGL.Map | null;
    isLoaded: boolean;
};

const MapContext = createContext<MapContextValue | null>(null);

function useMap() {
    const context = useContext(MapContext);
    if (!context) {
        throw new Error("useMap must be used within a Map component");
    }
    return context;
}

type MapViewport = {
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number;
};

type MapStyleOption = string | MapLibreGL.StyleSpecification;

type MapRef = MapLibreGL.Map;

type MapProps = {
    children?: ReactNode;
    className?: string;
    theme?: Theme;
    styles?: {
        light?: MapStyleOption;
        dark?: MapStyleOption;
    };
    projection?: MapLibreGL.ProjectionSpecification;
    viewport?: Partial<MapViewport>;
    onViewportChange?: (viewport: MapViewport) => void;
    loading?: boolean;
} & Omit<MapLibreGL.MapOptions, "container" | "style">;

function DefaultLoader() {
    return (
        <div className="map-default-loader">
            <div className="map-loader-dots">
                <span className="map-loader-dot" />
                <span className="map-loader-dot" />
                <span className="map-loader-dot" />
            </div>
        </div>
    );
}

function getViewport(map: MapLibreGL.Map): MapViewport {
    const center = map.getCenter();
    return {
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
    };
}

const Map = forwardRef<MapRef, MapProps>(function Map(
    {
        children,
        className,
        theme: themeProp,
        styles,
        projection,
        viewport,
        onViewportChange,
        loading = false,
        ...props
    },
    ref,
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [mapInstance, setMapInstance] = useState<MapLibreGL.Map | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isStyleLoaded, setIsStyleLoaded] = useState(false);
    const currentStyleRef = useRef<MapStyleOption | null>(null);
    const styleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const internalUpdateRef = useRef(false);
    const resolvedTheme = useResolvedTheme(themeProp);

    const isControlled = viewport !== undefined && onViewportChange !== undefined;

    const onViewportChangeRef = useRef(onViewportChange);
    onViewportChangeRef.current = onViewportChange;

    const mapStyles = useMemo(
        () => ({
            dark: styles?.dark ?? defaultStyles.dark,
            light: styles?.light ?? defaultStyles.light,
        }),
        [styles],
    );

    useImperativeHandle(ref, () => mapInstance as MapLibreGL.Map, [mapInstance]);

    const clearStyleTimeout = useCallback(() => {
        if (styleTimeoutRef.current) {
            clearTimeout(styleTimeoutRef.current);
            styleTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        const initialStyle =
            resolvedTheme === "dark" ? mapStyles.dark : mapStyles.light;
        currentStyleRef.current = initialStyle;

        const map = new MapLibreGL.Map({
            container: containerRef.current,
            style: initialStyle,
            renderWorldCopies: false,
            attributionControl: {
                compact: true,
            },
            ...props,
            ...viewport,
        });

        const styleDataHandler = () => {
            clearStyleTimeout();
            styleTimeoutRef.current = setTimeout(() => {
                setIsStyleLoaded(true);
                if (projection) {
                    (map as unknown as { setProjection?: (projection: MapLibreGL.ProjectionSpecification) => void })
                        .setProjection?.(projection);
                }
            }, 100);
        };
        const loadHandler = () => setIsLoaded(true);

        const handleMove = () => {
            if (internalUpdateRef.current) return;
            onViewportChangeRef.current?.(getViewport(map));
        };

        map.on("load", loadHandler);
        map.on("styledata", styleDataHandler);
        map.on("move", handleMove);
        setMapInstance(map);

        return () => {
            clearStyleTimeout();
            map.off("load", loadHandler);
            map.off("styledata", styleDataHandler);
            map.off("move", handleMove);
            map.remove();
            setIsLoaded(false);
            setIsStyleLoaded(false);
            setMapInstance(null);
        };
    }, []);

    useEffect(() => {
        if (!mapInstance || !isControlled || !viewport) return;
        if (mapInstance.isMoving()) return;

        const current = getViewport(mapInstance);
        const next = {
            center: viewport.center ?? current.center,
            zoom: viewport.zoom ?? current.zoom,
            bearing: viewport.bearing ?? current.bearing,
            pitch: viewport.pitch ?? current.pitch,
        };

        if (
            next.center[0] === current.center[0] &&
            next.center[1] === current.center[1] &&
            next.zoom === current.zoom &&
            next.bearing === current.bearing &&
            next.pitch === current.pitch
        ) {
            return;
        }

        internalUpdateRef.current = true;
        mapInstance.jumpTo(next);
        internalUpdateRef.current = false;
    }, [mapInstance, isControlled, viewport]);

    useEffect(() => {
        if (!mapInstance || !resolvedTheme) return;

        const newStyle =
            resolvedTheme === "dark" ? mapStyles.dark : mapStyles.light;

        if (currentStyleRef.current === newStyle) return;

        clearStyleTimeout();
        currentStyleRef.current = newStyle;
        setIsStyleLoaded(false);

        mapInstance.setStyle(newStyle, { diff: true });
    }, [mapInstance, resolvedTheme, mapStyles, clearStyleTimeout]);

    const contextValue = useMemo(
        () => ({ map: mapInstance, isLoaded: isLoaded && isStyleLoaded }),
        [mapInstance, isLoaded, isStyleLoaded],
    );

    return (
        <MapContext.Provider value={contextValue}>
            <div
                ref={containerRef}
                className={cn("map-root", className)}
            >
                {(!isLoaded || loading) && <DefaultLoader />}
                {mapInstance && children}
            </div>
        </MapContext.Provider>
    );
});

type MarkerContextValue = {
    marker: MapLibreGL.Marker;
    map: MapLibreGL.Map | null;
};

const MarkerContext = createContext<MarkerContextValue | null>(null);

function useMarkerContext() {
    const context = useContext(MarkerContext);
    if (!context) {
        throw new Error("Marker components must be used within MapMarker");
    }
    return context;
}

type MapMarkerProps = {
    longitude: number;
    latitude: number;
    children: ReactNode;
    onClick?: (e: MouseEvent) => void;
    onMouseEnter?: (e: MouseEvent) => void;
    onMouseLeave?: (e: MouseEvent) => void;
    onDragStart?: (lngLat: { lng: number; lat: number }) => void;
    onDrag?: (lngLat: { lng: number; lat: number }) => void;
    onDragEnd?: (lngLat: { lng: number; lat: number }) => void;
} & Omit<MarkerOptions, "element">;

function MapMarker({
    longitude,
    latitude,
    children,
    onClick,
    onMouseEnter,
    onMouseLeave,
    onDragStart,
    onDrag,
    onDragEnd,
    draggable = false,
    ...markerOptions
}: MapMarkerProps) {
    const { map } = useMap();

    const callbacksRef = useRef({
        onClick,
        onMouseEnter,
        onMouseLeave,
        onDragStart,
        onDrag,
        onDragEnd,
    });
    callbacksRef.current = {
        onClick,
        onMouseEnter,
        onMouseLeave,
        onDragStart,
        onDrag,
        onDragEnd,
    };

    const marker = useMemo(() => {
        const markerInstance = new MapLibreGL.Marker({
            ...markerOptions,
            element: document.createElement("div"),
            draggable,
        }).setLngLat([longitude, latitude]);

        const handleClick = (e: MouseEvent) => callbacksRef.current.onClick?.(e);
        const handleMouseEnter = (e: MouseEvent) =>
            callbacksRef.current.onMouseEnter?.(e);
        const handleMouseLeave = (e: MouseEvent) =>
            callbacksRef.current.onMouseLeave?.(e);

        markerInstance.getElement()?.addEventListener("click", handleClick);
        markerInstance
            .getElement()
            ?.addEventListener("mouseenter", handleMouseEnter);
        markerInstance
            .getElement()
            ?.addEventListener("mouseleave", handleMouseLeave);

        const handleDragStart = () => {
            const lngLat = markerInstance.getLngLat();
            callbacksRef.current.onDragStart?.({ lng: lngLat.lng, lat: lngLat.lat });
        };
        const handleDrag = () => {
            const lngLat = markerInstance.getLngLat();
            callbacksRef.current.onDrag?.({ lng: lngLat.lng, lat: lngLat.lat });
        };
        const handleDragEnd = () => {
            const lngLat = markerInstance.getLngLat();
            callbacksRef.current.onDragEnd?.({ lng: lngLat.lng, lat: lngLat.lat });
        };

        markerInstance.on("dragstart", handleDragStart);
        markerInstance.on("drag", handleDrag);
        markerInstance.on("dragend", handleDragEnd);

        return markerInstance;
    }, []);

    useEffect(() => {
        if (!map) return;

        marker.addTo(map);

        return () => {
            marker.remove();
        };
    }, [map]);

    if (
        marker.getLngLat().lng !== longitude ||
        marker.getLngLat().lat !== latitude
    ) {
        marker.setLngLat([longitude, latitude]);
    }
    if (marker.isDraggable() !== draggable) {
        marker.setDraggable(draggable);
    }

    const currentOffset = marker.getOffset();
    const newOffset = markerOptions.offset ?? [0, 0];
    const [newOffsetX, newOffsetY] = Array.isArray(newOffset)
        ? newOffset
        : [newOffset.x, newOffset.y];
    if (currentOffset.x !== newOffsetX || currentOffset.y !== newOffsetY) {
        marker.setOffset(newOffset);
    }

    if (marker.getRotation() !== markerOptions.rotation) {
        marker.setRotation(markerOptions.rotation ?? 0);
    }
    if (marker.getRotationAlignment() !== markerOptions.rotationAlignment) {
        marker.setRotationAlignment(markerOptions.rotationAlignment ?? "auto");
    }
    if (marker.getPitchAlignment() !== markerOptions.pitchAlignment) {
        marker.setPitchAlignment(markerOptions.pitchAlignment ?? "auto");
    }

    return (
        <MarkerContext.Provider value={{ marker, map }}>
            {children}
        </MarkerContext.Provider>
    );
}

type MarkerContentProps = {
    children?: ReactNode;
    className?: string;
};

function MarkerContent({ children, className }: MarkerContentProps) {
    const { marker } = useMarkerContext();

    return createPortal(
        <div className={cn("relative cursor-pointer", className)}>
            {children || <DefaultMarkerIcon />}
        </div>,
        marker.getElement(),
    );
}

function DefaultMarkerIcon() {
    return (
        <div className="default-marker-icon" />
    );
}

function PopupCloseButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label="Close popup"
            className="popup-close-button"
        >
            <X className="size-3.5" />
        </button>
    );
}

type MarkerPopupProps = {
    children: ReactNode;
    className?: string;
    closeButton?: boolean;
} & Omit<PopupOptions, "className" | "closeButton">;

function MarkerPopup({
    children,
    className,
    closeButton = false,
    ...popupOptions
}: MarkerPopupProps) {
    const { marker, map } = useMarkerContext();
    const container = useMemo(() => document.createElement("div"), []);
    const prevPopupOptions = useRef(popupOptions);

    const popup = useMemo(() => {
        const popupInstance = new MapLibreGL.Popup({
            offset: 16,
            ...popupOptions,
            closeButton: false,
        })
            .setMaxWidth("none")
            .setDOMContent(container);

        return popupInstance;
    }, []);

    useEffect(() => {
        if (!map) return;

        popup.setDOMContent(container);
        marker.setPopup(popup);

        return () => {
            marker.setPopup(null);
        };
    }, [map]);

    if (popup.isOpen()) {
        const prev = prevPopupOptions.current;

        if (prev.offset !== popupOptions.offset) {
            popup.setOffset(popupOptions.offset ?? 16);
        }
        if (prev.maxWidth !== popupOptions.maxWidth && popupOptions.maxWidth) {
            popup.setMaxWidth(popupOptions.maxWidth ?? "none");
        }

        prevPopupOptions.current = popupOptions;
    }

    const handleClose = () => popup.remove();

    return createPortal(
        <div className={cn("marker-popup-content", className)}>
            {closeButton && <PopupCloseButton onClick={handleClose} />}
            {children}
        </div>,
        container,
    );
}

type MarkerTooltipProps = {
    children: ReactNode;
    className?: string;
} & Omit<PopupOptions, "className" | "closeButton" | "closeOnClick">;

function MarkerTooltip({
    children,
    className,
    ...popupOptions
}: MarkerTooltipProps) {
    const { marker, map } = useMarkerContext();
    const container = useMemo(() => document.createElement("div"), []);
    const prevTooltipOptions = useRef(popupOptions);

    const tooltip = useMemo(() => {
        const tooltipInstance = new MapLibreGL.Popup({
            offset: 16,
            ...popupOptions,
            closeOnClick: true,
            closeButton: false,
        }).setMaxWidth("none");

        return tooltipInstance;
    }, []);

    useEffect(() => {
        if (!map) return;

        tooltip.setDOMContent(container);

        const handleMouseEnter = () => {
            tooltip.setLngLat(marker.getLngLat()).addTo(map);
        };
        const handleMouseLeave = () => tooltip.remove();

        marker.getElement()?.addEventListener("mouseenter", handleMouseEnter);
        marker.getElement()?.addEventListener("mouseleave", handleMouseLeave);

        return () => {
            marker.getElement()?.removeEventListener("mouseenter", handleMouseEnter);
            marker.getElement()?.removeEventListener("mouseleave", handleMouseLeave);
            tooltip.remove();
        };
    }, [map]);

    if (tooltip.isOpen()) {
        const prev = prevTooltipOptions.current;

        if (prev.offset !== popupOptions.offset) {
            tooltip.setOffset(popupOptions.offset ?? 16);
        }
        if (prev.maxWidth !== popupOptions.maxWidth && popupOptions.maxWidth) {
            tooltip.setMaxWidth(popupOptions.maxWidth ?? "none");
        }

        prevTooltipOptions.current = popupOptions;
    }

    return createPortal(
        <div className={cn("marker-tooltip-content", className)}>
            {children}
        </div>,
        container,
    );
}

type MarkerLabelProps = {
    children: ReactNode;
    className?: string;
    position?: "top" | "bottom";
};

function MarkerLabel({
    children,
    className,
    position = "top",
}: MarkerLabelProps) {
    const positionClasses = {
        top: "bottom-full mb-1",
        bottom: "top-full mt-1",
    };

    return (
        <div
            className={cn(
                "marker-label",
                positionClasses[position],
                className,
            )}
        >
            {children}
        </div>
    );
}

type MapControlsProps = {
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    showZoom?: boolean;
    showCompass?: boolean;
    showLocate?: boolean;
    showFullscreen?: boolean;
    className?: string;
    onLocate?: (coords: { longitude: number; latitude: number }) => void;
};

const positionClasses = {
    "top-left": "top-2 left-2",
    "top-right": "top-2 right-2",
    "bottom-left": "bottom-2 left-2",
    "bottom-right": "bottom-10 right-2",
};

function ControlGroup({ children }: { children: React.ReactNode }) {
    return <div className="control-group">{children}</div>;
}

function ControlButton({
    onClick,
    label,
    children,
    disabled = false,
}: {
    onClick: () => void;
    label: string;
    children: React.ReactNode;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            type="button"
            className="control-button"
            disabled={disabled}
        >
            {children}
        </button>
    );
}

function MapControls({
    position = "bottom-right",
    showZoom = true,
    showCompass = false,
    showLocate = false,
    showFullscreen = false,
    className,
    onLocate,
}: MapControlsProps) {
    const { map } = useMap();
    const [waitingForLocation, setWaitingForLocation] = useState(false);

    const handleZoomIn = useCallback(() => {
        map?.zoomTo(map.getZoom() + 1, { duration: 300 });
    }, [map]);

    const handleZoomOut = useCallback(() => {
        map?.zoomTo(map.getZoom() - 1, { duration: 300 });
    }, [map]);

    const handleResetBearing = useCallback(() => {
        map?.resetNorthPitch({ duration: 300 });
    }, [map]);

    const handleLocate = useCallback(() => {
        setWaitingForLocation(true);
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords = {
                        longitude: pos.coords.longitude,
                        latitude: pos.coords.latitude,
                    };
                    map?.flyTo({
                        center: [coords.longitude, coords.latitude],
                        zoom: 14,
                        duration: 1500,
                    });
                    onLocate?.(coords);
                    setWaitingForLocation(false);
                },
                () => {
                    setWaitingForLocation(false);
                },
            );
        }
    }, [map, onLocate]);

    const handleFullscreen = useCallback(() => {
        const container = map?.getContainer();
        if (!container) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            container.requestFullscreen();
        }
    }, [map]);

    return (
        <div className={cn("map-controls", positionClasses[position], className)}>
            {showZoom && (
                <ControlGroup>
                    <ControlButton onClick={handleZoomIn} label="Zoom in">
                        <Plus className="size-4" />
                    </ControlButton>
                    <ControlButton onClick={handleZoomOut} label="Zoom out">
                        <Minus className="size-4" />
                    </ControlButton>
                </ControlGroup>
            )}
            {showCompass && (
                <ControlGroup>
                    <CompassButton onClick={handleResetBearing} />
                </ControlGroup>
            )}
            {showLocate && (
                <ControlGroup>
                    <ControlButton
                        onClick={handleLocate}
                        label="Find my location"
                        disabled={waitingForLocation}
                    >
                        {waitingForLocation ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Locate className="size-4" />
                        )}
                    </ControlButton>
                </ControlGroup>
            )}
            {showFullscreen && (
                <ControlGroup>
                    <ControlButton onClick={handleFullscreen} label="Toggle fullscreen">
                        <Maximize className="size-4" />
                    </ControlButton>
                </ControlGroup>
            )}
        </div>
    );
}

function CompassButton({ onClick }: { onClick: () => void }) {
    const { map } = useMap();
    const compassRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!map || !compassRef.current) return;

        const compass = compassRef.current;

        const updateRotation = () => {
            const bearing = map.getBearing();
            const pitch = map.getPitch();
            compass.style.transform = `rotateX(${pitch}deg) rotateZ(${-bearing}deg)`;
        };

        map.on("rotate", updateRotation);
        map.on("pitch", updateRotation);
        updateRotation();

        return () => {
            map.off("rotate", updateRotation);
            map.off("pitch", updateRotation);
        };
    }, [map]);

    return (
        <ControlButton onClick={onClick} label="Reset bearing to north">
            <svg
                ref={compassRef}
                viewBox="0 0 24 24"
                className="size-5"
                style={{ transformStyle: "preserve-3d" }}
            >
                <path d="M12 2L16 12H12V2Z" className="fill-red-500" />
                <path d="M12 2L8 12H12V2Z" className="fill-red-300" />
                <path d="M12 22L16 12H12V22Z" className="fill-muted-foreground/60" />
                <path d="M12 22L8 12H12V22Z" className="fill-muted-foreground/30" />
            </svg>
        </ControlButton>
    );
}

type MapPopupProps = {
    longitude: number;
    latitude: number;
    onClose?: () => void;
    children: ReactNode;
    className?: string;
    closeButton?: boolean;
} & Omit<PopupOptions, "className" | "closeButton">;

function MapPopup({
    longitude,
    latitude,
    onClose,
    children,
    className,
    closeButton = false,
    ...popupOptions
}: MapPopupProps) {
    const { map } = useMap();
    const popupOptionsRef = useRef(popupOptions);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const container = useMemo(() => document.createElement("div"), []);

    const popup = useMemo(() => {
        const popupInstance = new MapLibreGL.Popup({
            offset: 16,
            ...popupOptions,
            closeButton: false,
        })
            .setMaxWidth("none")
            .setLngLat([longitude, latitude]);

        return popupInstance;
    }, []);

    useEffect(() => {
        if (!map) return;

        const onCloseProp = () => onCloseRef.current?.();

        popup.on("close", onCloseProp);

        popup.setDOMContent(container);
        popup.addTo(map);

        return () => {
            popup.off("close", onCloseProp);
            if (popup.isOpen()) {
                popup.remove();
            }
        };
    }, [map]);

    if (popup.isOpen()) {
        const prev = popupOptionsRef.current;

        if (
            popup.getLngLat().lng !== longitude ||
            popup.getLngLat().lat !== latitude
        ) {
            popup.setLngLat([longitude, latitude]);
        }

        if (prev.offset !== popupOptions.offset) {
            popup.setOffset(popupOptions.offset ?? 16);
        }
        if (prev.maxWidth !== popupOptions.maxWidth && popupOptions.maxWidth) {
            popup.setMaxWidth(popupOptions.maxWidth ?? "none");
        }
        popupOptionsRef.current = popupOptions;
    }

    const handleClose = () => {
        popup.remove();
    };

    return createPortal(
        <div className={cn("map-popup", className)}>
            {closeButton && <PopupCloseButton onClick={handleClose} />}
            {children}
        </div>,
        container,
    );
}

type MapRouteProps = {
    id?: string;
    coordinates: [number, number][];
    color?: string;
    width?: number;
    opacity?: number;
    dashArray?: [number, number];
    onClick?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    interactive?: boolean;
};

function MapRoute({
    id: propId,
    coordinates,
    color = "#4285F4",
    width = 3,
    opacity = 0.8,
    dashArray,
    onClick,
    onMouseEnter,
    onMouseLeave,
    interactive = true,
}: MapRouteProps) {
    const { map, isLoaded } = useMap();
    const autoId = useId();
    const id = propId ?? autoId;
    const sourceId = `route-source-${id}`;
    const layerId = `route-layer-${id}`;

    useEffect(() => {
        if (!isLoaded || !map) return;

        map.addSource(sourceId, {
            type: "geojson",
            data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [] },
            },
        });

        map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
                "line-color": color,
                "line-width": width,
                "line-opacity": opacity,
                ...(dashArray && { "line-dasharray": dashArray }),
            },
        });

        return () => {
            try {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
                if (map.getSource(sourceId)) map.removeSource(sourceId);
            } catch {
                // ignore
            }
        };
    }, [isLoaded, map]);

    useEffect(() => {
        if (!isLoaded || !map || coordinates.length < 2) return;

        const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource;
        if (source) {
            source.setData({
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates },
            });
        }
    }, [isLoaded, map, coordinates, sourceId]);

    useEffect(() => {
        if (!isLoaded || !map || !map.getLayer(layerId)) return;

        map.setPaintProperty(layerId, "line-color", color);
        map.setPaintProperty(layerId, "line-width", width);
        map.setPaintProperty(layerId, "line-opacity", opacity);
        if (dashArray) {
            map.setPaintProperty(layerId, "line-dasharray", dashArray);
        }
    }, [isLoaded, map, layerId, color, width, opacity, dashArray]);

    useEffect(() => {
        if (!isLoaded || !map || !interactive) return;

        const handleClick = () => {
            onClick?.();
        };
        const handleMouseEnter = () => {
            map.getCanvas().style.cursor = "pointer";
            onMouseEnter?.();
        };
        const handleMouseLeave = () => {
            map.getCanvas().style.cursor = "";
            onMouseLeave?.();
        };

        map.on("click", layerId, handleClick);
        map.on("mouseenter", layerId, handleMouseEnter);
        map.on("mouseleave", layerId, handleMouseLeave);

        return () => {
            map.off("click", layerId, handleClick);
            map.off("mouseenter", layerId, handleMouseEnter);
            map.off("mouseleave", layerId, handleMouseLeave);
        };
    }, [
        isLoaded,
        map,
        layerId,
        onClick,
        onMouseEnter,
        onMouseLeave,
        interactive,
    ]);

    return null;
}

type MapArcDatum = {
    id: string | number;
    from: [number, number];
    to: [number, number];
};

type MapArcEvent<T extends MapArcDatum = MapArcDatum> = {
    arc: T;
    longitude: number;
    latitude: number;
    originalEvent: MapLibreGL.MapMouseEvent;
};

type MapArcLinePaint = NonNullable<MapLibreGL.LineLayerSpecification["paint"]>;
type MapArcLineLayout = NonNullable<
    MapLibreGL.LineLayerSpecification["layout"]
>;

type MapArcProps<T extends MapArcDatum = MapArcDatum> = {
    data: T[];
    id?: string;
    curvature?: number;
    samples?: number;
    paint?: MapArcLinePaint;
    layout?: MapArcLineLayout;
    hoverPaint?: MapArcLinePaint;
    onClick?: (e: MapArcEvent<T>) => void;
    onHover?: (e: MapArcEvent<T> | null) => void;
    interactive?: boolean;
    beforeId?: string;
};

const DEFAULT_ARC_CURVATURE = 0.2;
const DEFAULT_ARC_SAMPLES = 64;
const ARC_HIT_MIN_WIDTH = 12;
const ARC_HIT_PADDING = 6;

const DEFAULT_ARC_PAINT: MapArcLinePaint = {
    "line-color": "#4285F4",
    "line-width": 2,
    "line-opacity": 0.85,
};

const DEFAULT_ARC_LAYOUT: MapArcLineLayout = {
    "line-join": "round",
    "line-cap": "round",
};

function mergeArcPaint(
    paint: MapArcLinePaint,
    hoverPaint: MapArcLinePaint | undefined,
): MapArcLinePaint {
    if (!hoverPaint) return paint;
    const merged: Record<string, unknown> = { ...paint };
    for (const [key, hoverValue] of Object.entries(hoverPaint)) {
        if (hoverValue === undefined) continue;
        const baseValue = merged[key];
        merged[key] =
            baseValue === undefined
                ? hoverValue
                : [
                    "case",
                    ["boolean", ["feature-state", "hover"], false],
                    hoverValue,
                    baseValue,
                ];
    }
    return merged as MapArcLinePaint;
}

function buildArcCoordinates(
    from: [number, number],
    to: [number, number],
    curvature: number,
    samples: number,
): [number, number][] {
    const [x0, y0] = from;
    const [x2, y2] = to;
    const dx = x2 - x0;
    const dy = y2 - y0;
    const distance = Math.hypot(dx, dy);

    if (distance === 0 || curvature === 0) return [from, to];

    const mx = (x0 + x2) / 2;
    const my = (y0 + y2) / 2;
    const nx = -dy / distance;
    const ny = dx / distance;
    const offset = distance * curvature;
    const cx = mx + nx * offset;
    const cy = my + ny * offset;

    const points: [number, number][] = [];
    const segments = Math.max(2, Math.floor(samples));
    for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const inv = 1 - t;
        const x = inv * inv * x0 + 2 * inv * t * cx + t * t * x2;
        const y = inv * inv * y0 + 2 * inv * t * cy + t * t * y2;
        points.push([x, y]);
    }
    return points;
}

function MapArc<T extends MapArcDatum = MapArcDatum>({
    data,
    id: propId,
    curvature = DEFAULT_ARC_CURVATURE,
    samples = DEFAULT_ARC_SAMPLES,
    paint,
    layout,
    hoverPaint,
    onClick,
    onHover,
    interactive = true,
    beforeId,
}: MapArcProps<T>) {
    const { map, isLoaded } = useMap();
    const autoId = useId();
    const id = propId ?? autoId;
    const sourceId = `arc-source-${id}`;
    const layerId = `arc-layer-${id}`;
    const hitLayerId = `arc-hit-layer-${id}`;

    const mergedPaint = useMemo(
        () => mergeArcPaint({ ...DEFAULT_ARC_PAINT, ...paint }, hoverPaint),
        [paint, hoverPaint],
    );
    const mergedLayout = useMemo(
        () => ({ ...DEFAULT_ARC_LAYOUT, ...layout }),
        [layout],
    );

    const hitWidth = useMemo(() => {
        const w = paint?.["line-width"] ?? DEFAULT_ARC_PAINT["line-width"];
        const base = typeof w === "number" ? w : ARC_HIT_MIN_WIDTH;
        return Math.max(base + ARC_HIT_PADDING, ARC_HIT_MIN_WIDTH);
    }, [paint]);

    const geoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
        () => ({
            type: "FeatureCollection",
            features: data.map((arc) => {
                const { from, to, ...properties } = arc;
                return {
                    type: "Feature",
                    properties,
                    geometry: {
                        type: "LineString",
                        coordinates: buildArcCoordinates(from, to, curvature, samples),
                    },
                };
            }),
        }),
        [data, curvature, samples],
    );

    const latestRef = useRef({ data, onClick, onHover });
    latestRef.current = { data, onClick, onHover };

    useEffect(() => {
        if (!isLoaded || !map) return;

        map.addSource(sourceId, {
            type: "geojson",
            data: geoJSON,
            promoteId: "id",
        });

        map.addLayer(
            {
                id: hitLayerId,
                type: "line",
                source: sourceId,
                layout: DEFAULT_ARC_LAYOUT,
                paint: {
                    "line-color": "rgba(0, 0, 0, 0)",
                    "line-width": hitWidth,
                    "line-opacity": 1,
                },
            },
            beforeId,
        );

        map.addLayer(
            {
                id: layerId,
                type: "line",
                source: sourceId,
                layout: mergedLayout,
                paint: mergedPaint,
            },
            beforeId,
        );

        return () => {
            try {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
                if (map.getLayer(hitLayerId)) map.removeLayer(hitLayerId);
                if (map.getSource(sourceId)) map.removeSource(sourceId);
            } catch {
                // ignore
            }
        };
    }, [isLoaded, map]);

    useEffect(() => {
        if (!isLoaded || !map) return;
        const source = map.getSource(sourceId) as
            | MapLibreGL.GeoJSONSource
            | undefined;
        source?.setData(geoJSON);
    }, [isLoaded, map, geoJSON, sourceId]);

    useEffect(() => {
        if (!isLoaded || !map || !map.getLayer(layerId)) return;
        for (const [key, value] of Object.entries(mergedPaint)) {
            map.setPaintProperty(
                layerId,
                key as keyof MapArcLinePaint,
                value as never,
            );
        }
        for (const [key, value] of Object.entries(mergedLayout)) {
            map.setLayoutProperty(
                layerId,
                key as keyof MapArcLineLayout,
                value as never,
            );
        }
        if (map.getLayer(hitLayerId)) {
            map.setPaintProperty(hitLayerId, "line-width", hitWidth);
        }
    }, [isLoaded, map, layerId, hitLayerId, mergedPaint, mergedLayout, hitWidth]);

    useEffect(() => {
        if (!isLoaded || !map || !interactive) return;

        let hoveredId: string | number | null = null;

        const setHover = (next: string | number | null) => {
            if (next === hoveredId) return;
            const sourceExists = !!map.getSource(sourceId);
            if (hoveredId != null && sourceExists) {
                map.setFeatureState(
                    { source: sourceId, id: hoveredId },
                    { hover: false },
                );
            }
            hoveredId = next;
            if (next != null && sourceExists) {
                map.setFeatureState({ source: sourceId, id: next }, { hover: true });
            }
        };

        const findArc = (featureId: string | number | undefined) =>
            featureId == null
                ? undefined
                : latestRef.current.data.find(
                    (arc) => String(arc.id) === String(featureId),
                );

        const handleMouseMove = (e: MapLibreGL.MapLayerMouseEvent) => {
            const featureId = e.features?.[0]?.id as string | number | undefined;
            if (featureId == null || featureId === hoveredId) return;

            setHover(featureId);
            map.getCanvas().style.cursor = "pointer";

            const arc = findArc(featureId);
            if (arc) {
                latestRef.current.onHover?.({
                    arc: arc as T,
                    longitude: e.lngLat.lng,
                    latitude: e.lngLat.lat,
                    originalEvent: e,
                });
            }
        };

        const handleMouseLeave = () => {
            setHover(null);
            map.getCanvas().style.cursor = "";
            latestRef.current.onHover?.(null);
        };

        const handleClick = (e: MapLibreGL.MapLayerMouseEvent) => {
            const arc = findArc(e.features?.[0]?.id as string | number | undefined);
            if (!arc) return;
            latestRef.current.onClick?.({
                arc: arc as T,
                longitude: e.lngLat.lng,
                latitude: e.lngLat.lat,
                originalEvent: e,
            });
        };

        map.on("mousemove", hitLayerId, handleMouseMove);
        map.on("mouseleave", hitLayerId, handleMouseLeave);
        map.on("click", hitLayerId, handleClick);

        return () => {
            map.off("mousemove", hitLayerId, handleMouseMove);
            map.off("mouseleave", hitLayerId, handleMouseLeave);
            map.off("click", hitLayerId, handleClick);
            setHover(null);
            map.getCanvas().style.cursor = "";
        };
    }, [isLoaded, map, hitLayerId, sourceId, interactive]);

    return null;
}

type MapClusterLayerProps<
    P extends GeoJSON.GeoJsonProperties = GeoJSON.GeoJsonProperties,
> = {
    data: string | GeoJSON.FeatureCollection<GeoJSON.Point, P>;
    clusterMaxZoom?: number;
    clusterRadius?: number;
    clusterColors?: [string, string, string];
    clusterThresholds?: [number, number];
    pointColor?: string;
    onPointClick?: (
        feature: GeoJSON.Feature<GeoJSON.Point, P>,
        coordinates: [number, number],
    ) => void;
    onClusterClick?: (
        clusterId: number,
        coordinates: [number, number],
        pointCount: number,
    ) => void;
};

function MapClusterLayer<
    P extends GeoJSON.GeoJsonProperties = GeoJSON.GeoJsonProperties,
>({
    data,
    clusterMaxZoom = 14,
    clusterRadius = 50,
    clusterColors = ["#22c55e", "#eab308", "#ef4444"],
    clusterThresholds = [100, 750],
    pointColor = "#3b82f6",
    onPointClick,
    onClusterClick,
}: MapClusterLayerProps<P>) {
    const { map, isLoaded } = useMap();
    const id = useId();
    const sourceId = `cluster-source-${id}`;
    const clusterLayerId = `clusters-${id}`;
    const clusterCountLayerId = `cluster-count-${id}`;
    const unclusteredLayerId = `unclustered-point-${id}`;

    const stylePropsRef = useRef({
        clusterColors,
        clusterThresholds,
        pointColor,
    });

    useEffect(() => {
        if (!isLoaded || !map) return;

        map.addSource(sourceId, {
            type: "geojson",
            data,
            cluster: true,
            clusterMaxZoom,
            clusterRadius,
        });

        map.addLayer({
            id: clusterLayerId,
            type: "circle",
            source: sourceId,
            filter: ["has", "point_count"],
            paint: {
                "circle-color": [
                    "step",
                    ["get", "point_count"],
                    clusterColors[0],
                    clusterThresholds[0],
                    clusterColors[1],
                    clusterThresholds[1],
                    clusterColors[2],
                ],
                "circle-radius": [
                    "step",
                    ["get", "point_count"],
                    20,
                    clusterThresholds[0],
                    30,
                    clusterThresholds[1],
                    40,
                ],
                "circle-stroke-width": 1,
                "circle-stroke-color": "#fff",
                "circle-opacity": 0.85,
            },
        });

        map.addLayer({
            id: clusterCountLayerId,
            type: "symbol",
            source: sourceId,
            filter: ["has", "point_count"],
            layout: {
                "text-field": "{point_count_abbreviated}",
                "text-font": ["Open Sans"],
                "text-size": 12,
            },
            paint: {
                "text-color": "#fff",
            },
        });

        map.addLayer({
            id: unclusteredLayerId,
            type: "circle",
            source: sourceId,
            filter: ["!", ["has", "point_count"]],
            paint: {
                "circle-color": pointColor,
                "circle-radius": 5,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#fff",
            },
        });

        return () => {
            try {
                if (map.getLayer(clusterCountLayerId))
                    map.removeLayer(clusterCountLayerId);
                if (map.getLayer(unclusteredLayerId))
                    map.removeLayer(unclusteredLayerId);
                if (map.getLayer(clusterLayerId)) map.removeLayer(clusterLayerId);
                if (map.getSource(sourceId)) map.removeSource(sourceId);
            } catch {
                // ignore
            }
        };
    }, [isLoaded, map, sourceId]);

    useEffect(() => {
        if (!isLoaded || !map || typeof data === "string") return;

        const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource;
        if (source) {
            source.setData(data);
        }
    }, [isLoaded, map, data, sourceId]);

    useEffect(() => {
        if (!isLoaded || !map) return;

        const prev = stylePropsRef.current;
        const colorsChanged =
            prev.clusterColors !== clusterColors ||
            prev.clusterThresholds !== clusterThresholds;

        if (map.getLayer(clusterLayerId) && colorsChanged) {
            map.setPaintProperty(clusterLayerId, "circle-color", [
                "step",
                ["get", "point_count"],
                clusterColors[0],
                clusterThresholds[0],
                clusterColors[1],
                clusterThresholds[1],
                clusterColors[2],
            ]);
            map.setPaintProperty(clusterLayerId, "circle-radius", [
                "step",
                ["get", "point_count"],
                20,
                clusterThresholds[0],
                30,
                clusterThresholds[1],
                40,
            ]);
        }

        if (map.getLayer(unclusteredLayerId) && prev.pointColor !== pointColor) {
            map.setPaintProperty(unclusteredLayerId, "circle-color", pointColor);
        }

        stylePropsRef.current = { clusterColors, clusterThresholds, pointColor };
    }, [
        isLoaded,
        map,
        clusterLayerId,
        unclusteredLayerId,
        clusterColors,
        clusterThresholds,
        pointColor,
    ]);

    useEffect(() => {
        if (!isLoaded || !map) return;

        const handleClusterClick = async (
            e: MapLibreGL.MapMouseEvent & {
                features?: MapLibreGL.MapGeoJSONFeature[];
            },
        ) => {
            const features = map.queryRenderedFeatures(e.point, {
                layers: [clusterLayerId],
            });
            if (!features.length) return;

            const feature = features[0];
            const clusterId = feature.properties?.cluster_id as number;
            const pointCount = feature.properties?.point_count as number;
            const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [
                number,
                number,
            ];

            if (onClusterClick) {
                onClusterClick(clusterId, coordinates, pointCount);
            } else {
                const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource;
                const zoom = await source.getClusterExpansionZoom(clusterId);
                map.easeTo({
                    center: coordinates,
                    zoom,
                });
            }
        };

        const handlePointClick = (
            e: MapLibreGL.MapMouseEvent & {
                features?: MapLibreGL.MapGeoJSONFeature[];
            },
        ) => {
            if (!onPointClick || !e.features?.length) return;

            const feature = e.features[0];
            const coordinates = (
                feature.geometry as GeoJSON.Point
            ).coordinates.slice() as [number, number];

            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }

            onPointClick(
                feature as unknown as GeoJSON.Feature<GeoJSON.Point, P>,
                coordinates,
            );
        };

        const handleMouseEnterCluster = () => {
            map.getCanvas().style.cursor = "pointer";
        };
        const handleMouseLeaveCluster = () => {
            map.getCanvas().style.cursor = "";
        };
        const handleMouseEnterPoint = () => {
            if (onPointClick) {
                map.getCanvas().style.cursor = "pointer";
            }
        };
        const handleMouseLeavePoint = () => {
            map.getCanvas().style.cursor = "";
        };

        map.on("click", clusterLayerId, handleClusterClick);
        map.on("click", unclusteredLayerId, handlePointClick);
        map.on("mouseenter", clusterLayerId, handleMouseEnterCluster);
        map.on("mouseleave", clusterLayerId, handleMouseLeaveCluster);
        map.on("mouseenter", unclusteredLayerId, handleMouseEnterPoint);
        map.on("mouseleave", unclusteredLayerId, handleMouseLeavePoint);

        return () => {
            map.off("click", clusterLayerId, handleClusterClick);
            map.off("click", unclusteredLayerId, handlePointClick);
            map.off("mouseenter", clusterLayerId, handleMouseEnterCluster);
            map.off("mouseleave", clusterLayerId, handleMouseLeaveCluster);
            map.off("mouseenter", unclusteredLayerId, handleMouseEnterPoint);
            map.off("mouseleave", unclusteredLayerId, handleMouseLeavePoint);
        };
    }, [
        isLoaded,
        map,
        clusterLayerId,
        unclusteredLayerId,
        sourceId,
        onClusterClick,
        onPointClick,
    ]);

    return null;
}

type LocationProperties = {
    id: number;
    name: string;
    category: string;
    color: string;
    address: string;
    tel: string;
    img: string;
};

type SelectedPoint = LocationProperties & {
    coordinates: [number, number];
};

const pointsData: GeoJSON.FeatureCollection<GeoJSON.Point, LocationProperties> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.10264312254009, -31.42153017039745,] },
            properties: {
                id: 1,
                name: "POLO 52 Parque Industrial",
                category: "Fabricas",
                color: "#ef4444",
                address: "Pilar a 500 mts. de Av. Circunvalación, Au Córdoba - Rosario, Córdoba",
                tel: "+54 03515642685",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAGG2DKl307jPzlELcd1PuHKQRms0qniflXqZtUYdkW9Y6rMbV2NzyVGDhqJOcIiezAJPkThRj_A3Q26Oi-9_oIS4mBlbfzI7hxK_vTDTUHBjRqwVJIXon5VFz0V0t5xelqFhktCAg=w408-h408-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [ -64.34660756700644,-31.350024245909996] },
            properties: {
                id: 2,
                name: "Tu Fabrica Textil POD",
                category: "Fabrica",
                color: "#ff00d9",
                address: "Maria Elena Walsh 808, X5151 La Calera, Córdoba",
                tel: "+54 03515332629",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAG4_Lk2ZAoRT91KZAuWVEWOYkpD0h5KXyJnvsXD-upGdgKUVJvgl8hRiSV_YBFPNuj7Mj-FqWqKm0uuKuprKaAMDtO6FBRkwab9hAsG4amz5umOs5_G9FYjzjmokvSNN04XNeEpTryx32Q=w408-h306-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [ -64.2475566906784 , -31.328088959188992] },
            properties: {
                id: 3,
                name: "Craft textil",
                category: "Negocio",
                color: "#f59e0b",
                address: "Juan Manuel Fangio 7783, X5022 Córdoba",
                tel: "+54 03515159045",
                img: "https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=mf3w_wW3Zx51Mv3Xp11nEQ&cb_client=search.gws-prod.gps&w=408&h=240&yaw=295.71408&pitch=0&thumbfov=100",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [ -64.24296042201085 , -31.304166792080082] },
            properties: {
                id: 4,
                name: "Figrotex confección textil",
                category: "Negocios",
                color: "#3b82f6",
                address: "X5000 Córdoba",
                tel: "+54 03518125840",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAFCVuiPtjTPatiGrlnQxmKnahBkQ4_6gS6okedWHujAzNkN5Ibol12M-Ai0urwkyj2a_q2AlgOCYLBA5YlQIsQ2AfBH4BKdy8K2YOvTVQqQquaw0kQFr47ZzaeW4wuZtQmyK7-e=w408-h544-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.2156977380927 , -31.429644902580826] },
            properties: {
                id: 5,
                name: "Indultex",
                category: "Negocios",
                color: "#3b82f6",
                address: "Av. Fuerza Aérea Argentina 2195, X5010 Córdoba",
                tel: "+54 03514661093",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAGGIDs86Zfm8umtRwT6bH3FTwReZZCXVXvCGaU_Nb-TRrrKBovnvCyaAR-4ZW_01V5fid73BnBT2PZ23y2oPOm7p3Hfx4BXoF9fdlc-8NZCZJ1kEse-Uyi3lLwtBgEbNebw4etCUg=w408-h544-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.22031944555756 , -31.430308556887955 ] },
            properties: {
                id: 6,
                name: "Colores y Texturas",
                category: "Negocios",
                color: "#fdfd46",
                address: "Av. Fuerza Aérea Argentina 2417, X5010 Córdoba",
                tel: "+54 03517190312",
                img: "https://lh3.googleusercontent.com/gps-proxy/ALd4DhGpWcopoNyX3Npvgg6CFVilf8ZD7QVNFMR-0ehTmI-P8_by0bsB10I1wsnncbKgWa1eqp5HJ5cEb_za0KBMlpol44GWWzgScgEwVJjCZOl06MWZjd5KkkbT2SZ7ivFlbARug24TCRia_q8VbtY8ZBo1mnf1PTySDtJQTEYCUkZLSxtJlcwNyACdlYznVIEKFmQ1194=w408-h543-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18004201679096 , -31.422168606764387,] },
            properties: {
                id: 6,
                name: "La General SA",
                category: "Negocios",
                color: "#ff00d9",
                address: "Boulevard Dr. Arturo H. Illia 431, Centro, X5000ASE Córdoba",
                tel: "+54 03515216335",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAFVf1RO6GWCJApbzjDi0_L_kI-gtcAeg0UeJkSiZdW6DU7SXogB4FnQq8vFa5ixIxXBr6z2_36UxbTxB1YvNrqsx6KReP3L8S0sBbu-g8BMb5rEB41fAmwG2yzcS3jQNUU5gAbvTn6MlNc=w408-h306-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18079929207894 , -31.418709677559274] },
            properties: {
                id: 7,
                name: "Textiles Mayor SRL",
                category: "Negocios",
                color: "#c1c9c1",
                address: "Entre Ríos 233, X5022 ADE, Córdoba",
                tel: "+54 03514242431",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAEUztSl7zoMO9i1opdTNFy9kLoi1G2AHWCHaiAfjtSc8MYQH_AObFgkBBNIkaS5x19qU2NL9kQ0M7FJIGx9UKbpw0VYLn2GNRzay6VFrkcvuv5bWWVw5R697hAOwfftiYBzm9Ps7KTzxQgU=w408-h725-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18280329188221 , -31.418779548297262] },
            properties: {
                id: 8,
                name: "Masefer Indumentaria Laboral",
                category: "Negocios",
                color: "#c1c9c1",
                address: "Entre Ríos 233, X5022 ADE, Córdoba",
                tel: "+54 03514239910",
                img: "https://lh3.googleusercontent.com/gps-proxy/ALd4DhGpWcopoNyX3Npvgg6CFVilf8ZD7QVNFMR-0ehTmI-P8_by0bsB10I1wsnncbKgWa1eqp5HJ5cEb_za0KBMlpol44GWWzgScgEwVJjCZOl06MWZjd5KkkbT2SZ7ivFlbARug24TCRia_q8VbtY8ZBo1mnf1PTySDtJQTEYCUkZLSxtJlcwNyACdlYznVIEKFmQ1194=w408-h543-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18596737437296 , -31.41409987996837,] },
            properties: {
                id: 9,
                name: "Trama Club",
                category: "Negocios",
                color: "#c1c9c1",
                address: "Gral. Paz 81, X5000 Córdoba",
                tel: "+54 0351157523739",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAHcl8vX4dB3m8yQI6wY8sUNao6uHMwzqrTmnAg-AsPXCJdXjsNsnX5yfTEojj3gCaTDY5MaHDWTt5dR37ELFeKCrQaoOt5Ve6JBoFnXDnrUIvbMSFoyWYZkcj0uoB_wI-oi8sCP9u161dE=w408-h559-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.22381215953835 , -31.403877303822924] },
            properties: {
                id: 10,
                name: "Retanil",
                category: "Negocios",
                color: "#c1c9c1",
                address: "Caseros 3292, X5002AEH Córdoba",
                tel: "+54 __________",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAGOvCUdKbOC7Wvv2aEmqGfvWf8eAcYwFVYJ0i9YsmxFLVSWcK-rmCfaeKUlyDU4-DO-CN4iGtM6ALjGj3KzFkGf6anlbFcEPDBSXjL6oI0v-Wj6CEUE8vv4sQ7YHxTb89Aelj_Siw=w426-h240-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.21870227509503 , -31.40083498323738] },
            properties: {
                id: 11,
                name: "Brufman Textil",
                category: "Negocios",
                color: "#c1c9c1",
                address: "Alberdi, Av. Colón 3048, X5000EQO Córdoba",
                tel: "+54 03515216329",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAHXBTweJOm72aQvKsslytyjOdR6GE5e2ILw8QLvsJ82KHkt3Btw-UgvhEz6WunhqQr1teKzovSGzt8mQmGDVNzL5SUT6aNP-Hizsz69cpZ4xiw9kqML298EW1OoBWujEge5EwyT=w426-h240-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18512004203444 , -31.415876118153047] },
            properties: {
                id: 12,
                name: "Textil Trejo",
                category: "Negocios",
                color: "#c1c9c1",
                address: "Obispo Trejo 41, X5000 IYA, Córdoba",
                tel: "+54 0351155942301",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAHXWU6wM4_4UInwoiVb51YV3e2upXls3SDRyyJVAMX6vobJVFiKCnrIcnjNlvhjWQezgWqz3vkLGMiQdLtgSOk1sr09p1XYIsyepzGYYnXdk2ZimJ61Qu_pR1BVqIfhMVRq21SR=w426-h240-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18047976031491 , -31.421625904319164] },
            properties: {
                id: 13,
                name: "Canelo Textil: División Telas",
                category: "Negocios",
                color: "#4d40dd",
                address: "Blvd. Pres. Dr. Arturo U. Illia 365, X5000IAH Córdoba",
                tel: "+54 03513105280",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAGkWjsvKm-vPeJ8k9KgkuVX0Ymaaef5bMPDg-Zk2ZRjmh_5TravaNknOsz3YoXHR_sLqjppFqgfVSXcQ8bPAPIJjfDA7B22ZFNUIM9dWpd4YhpyoPM5HZbofHK_vGUD5shVFkygcA=w408-h544-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.17808450313272 , -31.421064400992947 ] },
            properties: {
                id: 14,
                name: "Canelo Textil",
                category: "Negocios",
                color: "#ff00d9",
                address: "Corrientes 501 Esquina, X5000 ASD, Córdoba",
                tel: "+54 03516831757",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAG3KDzdWgc2KMLqn8oeOjjuUifkKgfOwfCcGxERb1z9TPqMtwZkiMAzTKssTrqcfutNxp4eB4myynlFm18D55rtKKfXWlDCUFPPWPtXvR2lh6Q7JkKTVgmpNWLf8uzbAzYXopUn-w=w408-h408-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.1797785068009 ,-31.419491196668737, ] },
            properties: {
                id: 15,
                name: "CANELO M J",
                category: "Negocios",
                color: "#ff00d9",
                address: "Entre Ríos 375, X5000 Córdoba",
                tel: "+54 03516831757",
                img: "https://lh3.googleusercontent.com/gps-proxy/ALd4DhFlhUJpBa8C5dODOS_W25ZtFJeIgPobQzWwQyWqKSNw5TZdEymQhAusvIDIMvwg1tB7EJwvuFAyaywlJwN_76qM2M8oZ1Mcwuxx21zv72vg7xMkKCco4U7HrUJ7awPab8LrCYw1VQyR78_SW40mRknz7OF_LDyypYV9yZ-Gv-jNdAIOsIA0_HRUvngqlm9djL03YQ=w408-h306-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.1793664984724 , -31.42097810165456 ] },
            properties: {
                id: 16,
                name: "Texcor Telas",
                category: "Negocios",
                color: "#1a1735",
                address: "Corrientes 424, X5000 Córdoba",
                tel: "+54 03513714856",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAHOuOzCjHxIlzu1JrVQaT68T8yj3mIY34b-OqBP4a71flaAMcu0PI9ovd3birhdSSsafctmu7tXbul-sI6vjj8lULtkz0U2VXDeBTO9LjbW3rPt61Vr5uBZTJDly-C839MP83ir=w408-h272-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18545245187936 ,-31.415703581651595 ] },
            properties: {
                id: 17,
                name: "Sederia La Victoria",
                category: "Negocios",
                color: "#b67b15",
                address: "Rivera Indarte 15, X5000JAA Córdoba",
                tel: "+54 03513714856",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAHYZ8cpedpBrOrqfkqk1OY8EpCQiW_b5y1Job3AYI5reXQnJGtKCdK6FaO5913evrQIjeg88MSeq_OOojWFo7aN9va5JsqggspJD0kucEzY2xfKbELkrqAwTYN3nI98w6EZ1uaU=w408-h544-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18421749250602 , -31.415419690995964 ] },
            properties: {
                id: 19,
                name: "Galia",
                category: "Negocios",
                color: "#e7cb9a",
                address: "Deán Funes 85 5000, X5000AAB Córdoba",
                tel: "+54 03514215989",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAFt2dL-3tapeI2dbXFrfbuJasFpbDMMEbiVPNJA1TXQpNsNopSg08u9n3CFeOCYOiurdeo2o3QtKjkRMOKuKmS8ZRe-frpxeaKvEnMk43LccSNb3iTMAeL0E31Nil1cLfiafDdoPw=w426-h240-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [ -64.18136867286775 , -31.416141454966834] },
            properties: {
                id: 20,
                name: "MODA TEXTIL",
                category: "Negocios",
                color: "#130316",
                address: "Rosario de Sta. Fe 157, X5000ACC Córdoba",
                tel: "+54 03516248020",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAGzNtKQklhKqukC-FBm_DO1QS65Q1WTZtvdXoQjKpVxXuG4XlvSvxSSxHDqw5rMsFz9qn8ozA1naGDIWQ6mj5Na5ZMnXc5AF-6Zq-_G6sPmnZppu3z8cXCBeDpqtidtc3IYd104OdG6koY=w408-h544-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.19738130205313 , -31.403487954953047] },
            properties: {
                id: 21,
                name: "DiTec",
                category: "Negocios",
                color: "#ff00d9",
                address: "Rosario de Sta. Fe 157, X5000ACC Córdoba",
                tel: "+54 03514731650",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAEVZLIQDbhINDaf4eHC4vgHZktw6kPQq_DR39D1nYWD8kqh_dcCrAr-lHT7QCzjgzw98TZsJc7AvQd6KqIGv5mJEmkmxXUudOC2x2Jx9fwbhE4EdPGcf1NVEl9-0lVfbx31mdfqZbECDw4=w408-h306-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [ -64.17376052498841,-31.39621717048553] },
            properties: {
                id: 22,
                name: "Ames Textil",
                category: "Negocios",
                color: "#ff00d9",
                address: "Av. Juan B Justo 2397 BºALTA, X5001GXB Córdoba",
                tel: "+54 03514710624",
                img: "https://lh3.googleusercontent.com/gps-proxy/ALd4DhEMcm8ykZWtrUqjrz6aTT03VkVZ6Tk5UVpJpllTuSxf_BArVGm2QGFvJkYP0zHQ8qjBHsk2K4NJjIZZRCP8ufvhaq4MIOEEJ8WsFzvhH_QbSuIBVD0rpajfvPXZ02vNAYmrM5Odai1fuuSqmxaYQ0HQunAzyFDN0t2Qm3m0cThtoFgWftKYP1uGr6ZwU7voqM_R-JA=w408-h306-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [ -64.11955106431515 , -31.437917852667542] },
            properties: {
                id: 23,
                name: "Centro Verde Telas",
                category: "Negocios",
                color: "#00ff33",
                address: "X5006 Córdoba",
                tel: "+54 __________",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAHYJtCFh_aXOzpe2TOA3undZ0HJxTAfhhdu6787hBAXXaygiADITA5wsxTbfvm9Eip9L5qf40TByLSHacTaXMommQKBHAwpF7ZxuMwQNHnBhLJAPsBUgi4czYwybqkMLOmIU0guAA=w408-h544-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [ -64.21805145264261 , -31.430706303313322] },
            properties: {
                id: 24,
                name: "Indultex",
                category: "Negocios",
                color: "#ff0000",
                address: "Av. Fuerza Aérea Argentina 2195, X5010 Córdoba",
                tel: "+54 03514661093",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAGGIDs86Zfm8umtRwT6bH3FTwReZZCXVXvCGaU_Nb-TRrrKBovnvCyaAR-4ZW_01V5fid73BnBT2PZ23y2oPOm7p3Hfx4BXoF9fdlc-8NZCZJ1kEse-Uyi3lLwtBgEbNebw4etCUg=w408-h544-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.128659189727 , -31.354373139463124] },
            properties: {
                id: 22,
                name: "TRAMA 3 TEXTIL",
                category: "Negocios",
                color: "#ff0000",
                address: "Manzana 43 Lote 18B, X5000, Córdoba",
                tel: "+54 03512291920",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAGW6GE6Y8fq636eQpAFJZxMPOBUD7-QTEfgsgCKXNUFu6zbLaTGBT7O8bKkvAec83cDiek42P2I-ltPIYikuYBtjl2lGiNJLOMMIap-lZ4uresAfC_4W5ZQDsJNk0qLor1mcv_qvTKkv2jJ=w408-h541-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18094126258998 , -31.419296318833595] },
            properties: {
                id: 22,
                name: "Cba Textil Moda-Vanguardia",
                category: "Negocios",
                color: "#ff0000",
                address: "Manzana 43 Lote 18B, X5000, Córdoba",
                tel: "+54 03512291920",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAGPOTDDxceJOBYy0Jjk5QGtBbh2MNPXmOIT3I3XxpNZR6tnJL71_fLJLSA7x9m8-Jki4w09J9RP8QhlIne_0Iw2jXIwVQ9WYtJJw0CyllAhn-WyRRz-3PmhjFz191Qc0itQXEdWfQ=w408-h306-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.19731943478325 , -31.408345393503392 ] },
            properties: {
                id: 22,
                name: "Ctc Indumentaria",
                category: "Negocios",
                color: "#ff0000",
                address: "Cnel. Agustín Olmedo 185, X5000 Córdoba",
                tel: "+54 03513637930",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAFPhluRqjq4forRubFKe-8w4T3APQf_fFc-ukMJBnqgfbVeTR8O_xLNgOm2UfhZOFfWPQ-Lo-NHC_s12MxWXwMB5osFJwPAt713H8EtOA7fRVInzuH2ioEdTmE5jkgc_2LvWEdArhQ2qgs=w426-h240-k-no",
            },
        },
        {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-64.18140868716705 , -31.41058925013151,  ] },
            properties: {
                id: 22,
                name: "Grandes Tiendas Florencia",
                category: "Negocios",
                color: "#ff0000",
                address: "Ituzaingo 230 Ambrosio Olmos 36, San Martín 472, X5000 Córdoba",
                tel: "+54 03513074321",
                img: "https://lh3.googleusercontent.com/gps-cs-s/APNQkAFPhluRqjq4forRubFKe-8w4T3APQf_fFc-ukMJBnqgfbVeTR8O_xLNgOm2UfhZOFfWPQ-Lo-NHC_s12MxWXwMB5osFJwPAt713H8EtOA7fRVInzuH2ioEdTmE5jkgc_2LvWEdArhQ2qgs=w426-h240-k-no",
            },
        },


    ],
};



const locations: Array<SelectedPoint> = pointsData.features.map((feature) => ({
    ...(feature.properties as LocationProperties),
    coordinates: feature.geometry.coordinates as [number, number],
}));

function LayerMarkers() {
    const { map, isLoaded } = useMap();
    const id = useId();
    const sourceId = "markers-source-" + id;
    const layerId = "markers-layer-" + id;
    const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);

    useEffect(() => {
        if (!map || !isLoaded) return;
        map.addSource(sourceId, { type: "geojson", data: pointsData });
        map.addLayer({
            id: layerId,
            type: "circle",
            source: sourceId,
            paint: {
                "circle-radius": 8,
                "circle-color": ["get", "color"],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
            },
        });

        const handleClick = (
            e: MapLibreGL.MapMouseEvent & { features?: MapLibreGL.MapGeoJSONFeature[] },
        ) => {
            if (!e.features?.length) return;
            const feature = e.features[0];
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [
                number,
                number,
            ];
            const properties = feature.properties as LocationProperties;
            setSelectedPoint({
                ...properties,
                coordinates: coords,
            });
        };

        const handleMouseEnter = () => {
            map.getCanvas().style.cursor = "pointer";
        };

        const handleMouseLeave = () => {
            map.getCanvas().style.cursor = "";
        };

        map.on("click", layerId, handleClick);
        map.on("mouseenter", layerId, handleMouseEnter);
        map.on("mouseleave", layerId, handleMouseLeave);

        return () => {
            map.off("click", layerId, handleClick);
            map.off("mouseenter", layerId, handleMouseEnter);
            map.off("mouseleave", layerId, handleMouseLeave);
            try {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
                if (map.getSource(sourceId)) map.removeSource(sourceId);
            } catch { }
        };
    }, [map, isLoaded, sourceId, layerId]);

    return (
        <>
            {selectedPoint && (
                <MapPopup
                    longitude={selectedPoint.coordinates[0]}
                    latitude={selectedPoint.coordinates[1]}
                    onClose={() => setSelectedPoint(null)}
                    closeOnClick={false}
                    focusAfterOpen={false}
                    offset={10}
                    closeButton
                >
                    <div className="map-popup-card">
                        <p className="map-popup-title">{selectedPoint.name}</p>
                        <p className="map-popup-description">{selectedPoint.category}</p>
                        <p className="map-popup-description">{selectedPoint.address}</p>
                        <p className="map-popup-description">Tel: {selectedPoint.tel}</p>
                        {selectedPoint.img && (
                            <img
                                src={selectedPoint.img}
                                alt={selectedPoint.name}
                                className="map-popup-image"
                            />
                        )}
                    </div>
                </MapPopup>
            )}
        </>
    );
}

function LayerMarkersDemo() {
    return (
        <div className="layer-markers-demo">
            <div className="demo-map-shell">
                <Map center={[-64.19752461958734, -31.420231316685317]} zoom={12}>
                    <LayerMarkers />
                </Map>
            </div>
            <div className="location-list">
                {locations.map((location) => (
                    <article className="location-card" key={location.id}>
                        <img
                            src={location.img}
                            alt={location.name}
                            className="location-card-image"
                        />
                        <div className="location-card-content">
                            <h3>{location.name}</h3>
                            <p>{location.address}</p>
                            <p><strong>Tel:</strong> {location.tel}</p>
                            <p><strong>Categoría:</strong> {location.category}</p>
                            <p>
                                <strong>Coordenadas:</strong> {location.coordinates[1].toFixed(6)}, {location.coordinates[0].toFixed(6)}
                            </p>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}

export {
    LayerMarkers,
    Map,
    useMap,
    MapMarker,
    MarkerContent,
    MarkerPopup,
    MarkerTooltip,
    MarkerLabel,
    MapPopup,
    MapControls,
    MapRoute,
    MapArc,
    MapClusterLayer,
    LayerMarkersDemo,
};

export type { MapRef, MapViewport, MapArcDatum, MapArcEvent };
