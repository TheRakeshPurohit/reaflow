import React, { FC, ReactElement, Ref, useImperativeHandle, forwardRef, useLayoutEffect, useRef, Fragment, useMemo, useState, useCallback, useEffect } from 'react';
import { useId, CloneElement } from 'reablocks';
import { useGesture } from 'react-use-gesture';
import { Node, NodeDragType, NodeProps } from './symbols/Node';
import { Edge, EdgeProps } from './symbols/Edge';
import { ElkRoot, CanvasDirection, LayoutResult, ElkCanvasLayoutOptions } from './layout';
import { MarkerArrow, MarkerArrowProps } from './symbols/Arrow';
import { CanvasPosition, EdgeData, NodeData, PortData } from './types';
import classNames from 'classnames';
import { CanvasProvider, useCanvas } from './utils/CanvasProvider';
import { getDragNodeData } from './utils/helpers';
import { motion } from 'motion/react';
import { ZoomResult } from './utils/useZoom';
import css from './Canvas.module.css';

export interface CanvasContainerProps extends CanvasProps {
  /**
   * Nodes to render on the canvas.
   */
  nodes?: NodeData[];

  /**
   * Edges to render on the canvas.
   */
  edges?: EdgeData[];

  /**
   * Key of node/edge ids for selection.
   */
  selections?: string[];

  /**
   * Direction of the canvas layout.
   */
  direction?: CanvasDirection;

  /**
   * Whether the canvas is pannable or not.
   */
  pannable?: boolean;

  /**
   * Type of interaction to use for panning.
   */
  panType?: 'scroll' | 'drag';

  /**
   * Whether the canvas is zoomable or not.
   */
  zoomable?: boolean;

  /**
   * Where to position the canvas on load (if at all)
   */
  defaultPosition?: CanvasPosition;

  /**
   * Fit the canvas on load.
   */
  fit?: boolean;

  /**
   * Max height of the canvas scrollable area.
   */
  maxHeight?: number;

  /**
   * Max width of the canvas scrollable area.
   */
  maxWidth?: number;

  /**
   * Zoom factor.
   */
  zoom?: number;

  /**
   * Min zoom factor.
   */
  minZoom?: number;

  /**
   * Max zoom factor.
   */
  maxZoom?: number;

  /**
   * ELKJS Layout Options
   */
  layoutOptions?: ElkCanvasLayoutOptions;

  /**
   * Callback when a node is linked.
   */
  onNodeLink?: (event: any, fromNode: NodeData, toNode: NodeData, fromPort?: PortData) => void;

  /**
   * Callback to check if a node is linkable or not.
   */
  onNodeLinkCheck?: (event: any, fromNode: NodeData, toNode: NodeData, fromPort?: PortData) => undefined | boolean;

  /**
   * When the zoom changes.
   */
  onZoomChange?: (zoom: number) => void;

  /**
   * When the layout changes.
   */
  onLayoutChange?: (layout: ElkRoot) => void;
}

export interface CanvasProps {
  /**
   * CSS classname for the container.
   */
  className?: string;

  /**
   * Disable all events or not.
   */
  disabled?: boolean;

  /**
   * Whether the nodes / edges are animated or not.
   */
  animated?: boolean;

  /**
   * Static height of the canvas.
   */
  height?: number;

  /**
   * Static width of the canvas.
   */
  width?: number;

  /**
   * Whether you can drag connections or not.
   */
  readonly?: boolean;

  /**
   * Element of the drag edge.
   */
  dragEdge?: ReactElement<EdgeProps, typeof Edge> | ((edge: EdgeProps) => ReactElement<EdgeProps, typeof Edge>) | null;

  /**
   * Element of the drag node.
   */
  dragNode?: ReactElement<NodeProps, typeof Node> | ((node: NodeProps) => ReactElement<NodeProps, typeof Node>) | null;

  /**
   * Arrow shown on the edges.
   */
  arrow?: ReactElement<MarkerArrowProps, typeof MarkerArrow> | null;

  /**
   * Node or node callback to return element.
   */
  node?: ReactElement<NodeProps, typeof Node> | ((node: NodeProps) => ReactElement<NodeProps, typeof Node>);

  /**
   * Edge or edge callback to return element.
   */
  edge?: ReactElement<EdgeProps, typeof Edge> | ((edge: EdgeProps) => ReactElement<NodeProps, typeof Edge>);

  /**
   * When the canvas had a mouse enter.
   */
  onMouseEnter?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;

  /**
   * When the canvas had a mouse leave.
   */
  onMouseLeave?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;

  /**
   * When the canvas was clicked.
   */
  onCanvasClick?: (event: React.MouseEvent<SVGGElement, MouseEvent>) => void;
}

export type CanvasRef = LayoutResult & ZoomResult;

const InternalCanvas: FC<CanvasProps & { ref?: Ref<CanvasRef> }> = forwardRef(({ className, height = '100%', width = '100%', readonly, disabled = false, animated = true, arrow = <MarkerArrow />, node = <Node />, edge = <Edge />, dragNode = <Node />, dragEdge = <Edge />, onMouseEnter = () => undefined, onMouseLeave = () => undefined, onCanvasClick = () => undefined }, ref: Ref<CanvasRef>) => {
  const id = useId();
  const { pannable, dragCoords, dragNode: canvasDragNode, layout, containerRef, svgRef, canvasHeight, canvasWidth, xy, zoom, setZoom, observe, zoomIn, zoomOut, positionCanvas, fitCanvas, setScrollXY, panType, ...rest } = useCanvas();
  const [dragType, setDragType] = useState<null | NodeDragType>(null);

  useImperativeHandle(ref, () => ({
    ...rest,
    observe,
    zoom,
    xy,
    layout,
    canvasHeight,
    containerRef,
    canvasWidth,
    svgRef,
    positionCanvas,
    setZoom,
    zoomIn,
    zoomOut,
    fitCanvas,
    setScrollXY
  }));

  const mount = useRef<boolean>(false);
  const panStartScrollPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const dragNodeData = useMemo(() => getDragNodeData(canvasDragNode, layout?.children), [canvasDragNode, layout?.children]);
  const [dragNodeDataWithChildren, setDragNodeDataWithChildren] = useState<{
    [key: string]: any;
  }>(dragNodeData);
  const dragNodeElement = useMemo(() => (typeof dragNode === 'function' ? dragNode(dragNodeData as NodeProps) : dragNode), [dragNode, dragNodeData]);
  useLayoutEffect(() => {
    if (!mount.current && layout !== null && xy[0] > 0 && xy[1] > 0) {
      mount.current = true;
    }
  }, [layout, xy]);

  useGesture(
    {
      onDrag: ({ movement: [mx, my] }) => {
        // Update container scroll position during drag
        if (containerRef.current && !canvasDragNode) {
          containerRef.current.scrollLeft = panStartScrollPosition.current.x - mx;
          containerRef.current.scrollTop = panStartScrollPosition.current.y - my;
        }
      },
      onDragStart: () => {
        // Store the initial scroll position of the container when drag starts
        panStartScrollPosition.current = {
          x: containerRef.current?.scrollLeft || 0,
          y: containerRef.current?.scrollTop || 0
        };
      },
      onWheel: ({ event, delta, last }) => {
        !last && event.preventDefault();

        const zoomFactor = delta[1] * -0.02;

        if (delta[1] > 0) {
          zoomOut(zoomFactor);
        } else {
          zoomIn(zoomFactor);
        }
      }
    },
    {
      enabled: pannable && panType === 'drag',
      eventOptions: { passive: false },
      domTarget: containerRef
    }
  );

  const onDragStart = useCallback((event) => {
    setDragType(event.dragType);
  }, []);

  const createDragNodeChildren = useCallback(
    (children: any) => {
      if (!children || !Array.isArray(children)) {
        return [];
      }

      return children.map(({ children, ...n }) => {
        const element = typeof dragNode === 'function' ? dragNode(n as NodeProps) : dragNode;
        return <CloneElement<NodeProps> key={`${id}-node-${n.id}-node-drag`} element={element} disabled children={element.props.children} animated={animated} nodes={children} childEdge={dragEdge} childNode={dragNode} {...n} onDragStart={onDragStart} id={`${id}-node-${n.id}-node-drag`} />;
      });
    },
    // Passing in dragEdge (JSX) will cause the function to be recalculated constantly,
    // triggering the below useEffect. Since dragEdge and dragNode are passed in props
    // on Canvas, they are unlikely to change and can be ignored
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animated, id]
  );

  useEffect(() => {
    if (dragNodeData && Object.keys(dragNodeData).length > 0) {
      const nodeCopy = { ...dragNodeData };
      // Node children is expecting a list of React Elements, need to create a list of elements
      nodeCopy.children = createDragNodeChildren(nodeCopy.children);
      setDragNodeDataWithChildren(nodeCopy);
    }
  }, [createDragNodeChildren, dragNodeData, layout?.children]);

  return (
    <div
      style={{ height, width }}
      className={classNames(css.container, className, {
        [css.pannable]: pannable,
        [css.draggable]: panType === 'drag'
      })}
      ref={(el) => {
        // Really not a fan of this API change...
        // https://github.com/wellyshen/react-cool-dimensions#how-to-share-a-ref
        observe(el);

        // @ts-ignore
        containerRef.current = el;
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <svg xmlns="http://www.w3.org/2000/svg" id={id} ref={svgRef} height={canvasHeight} width={canvasWidth} onClick={onCanvasClick}>
        {arrow !== null && (
          <defs>
            <CloneElement<MarkerArrowProps> element={arrow} {...(arrow as MarkerArrowProps)} />
          </defs>
        )}
        <motion.g
          initial={{
            opacity: 0,
            scale: 0,
            transition: {
              translateX: false,
              translateY: false
            }
          }}
          animate={{
            opacity: 1,
            translateX: xy[0],
            translateY: xy[1],
            scale: zoom,
            transition: animated
              ? {
                velocity: 100,
                translateX: { duration: mount.current ? 0.3 : 0 },
                translateY: { duration: mount.current ? 0.3 : 0 },
                opacity: { duration: 0.8 },
                when: 'beforeChildren'
              }
              : {
                type: false,
                duration: 0,
                when: 'beforeChildren'
              }
          }}
        >
          {layout?.children?.map(({ children, ...n }) => {
            const element = typeof node === 'function' ? node(n) : node;
            return <CloneElement<NodeProps> key={n.id} element={element} disabled={disabled} children={element.props.children} animated={animated} nodes={children} childEdge={edge} childNode={node} {...n} onDragStart={onDragStart} id={`${id}-node-${n.id}`} />;
          })}
          {layout?.edges?.map((e) => {
            const element = typeof edge === 'function' ? edge(e) : edge;
            return (
              <CloneElement<EdgeProps>
                key={e.id}
                element={element}
                disabled={disabled}
                children={element.props.children}
                {...e}
                properties={{
                  ...e.properties,
                  ...(e.data ? { data: e.data } : {})
                }}
                id={`${id}-edge-${e.id}`}
              />
            );
          })}
          {dragCoords !== null && dragEdge && dragType === 'port' && !readonly && <CloneElement<EdgeProps> element={dragEdge} id={`${id}-edge-drag`} disabled sections={dragCoords} />}
          {layout?.children?.map(({ children, ports, ...n }) => (
            <Fragment key={n.id}>
              {ports?.length > 0 && (
                <motion.g
                  key={n.id}
                  initial={{
                    translateX: n.x,
                    translateY: n.y
                  }}
                  animate={{
                    translateX: n.x,
                    translateY: n.y
                  }}
                  transition={{ duration: 0 }}
                >
                  {ports.map((port, index) => (
                    <use key={index} xlinkHref={`#${id}-node-${n.id}-port-${port.id}`} style={{ pointerEvents: 'none' }} />
                  ))}
                </motion.g>
              )}
            </Fragment>
          ))}
          {dragCoords !== null && dragNodeDataWithChildren && dragType === 'node' && !readonly && <CloneElement<NodeProps> {...dragNodeDataWithChildren} element={dragNodeElement} height={dragNodeDataWithChildren?.props?.height || dragNodeDataWithChildren?.height} width={dragNodeDataWithChildren?.props?.width || dragNodeDataWithChildren?.width} id={`${id}-node-drag`} animated={animated} className={css.dragNode} disabled x={dragCoords[0].endPoint.x} y={dragCoords[0].endPoint.y} />}
        </motion.g>
      </svg>
    </div>
  );
});

export const Canvas: FC<CanvasContainerProps & { ref?: Ref<CanvasRef> }> = forwardRef(({ selections = [], readonly = false, fit = false, nodes = [], edges = [], maxHeight = 2000, maxWidth = 2000, direction = 'DOWN', pannable = true, panType = 'scroll', zoom = 1, defaultPosition = CanvasPosition.CENTER, zoomable = true, minZoom = -0.5, maxZoom = 1, onNodeLink = () => undefined, onNodeLinkCheck = () => undefined, onLayoutChange = () => undefined, onZoomChange = () => undefined, layoutOptions, ...rest }, ref: Ref<CanvasRef>) => (
  <CanvasProvider layoutOptions={layoutOptions} nodes={nodes} edges={edges} zoom={zoom} defaultPosition={defaultPosition} minZoom={minZoom} maxZoom={maxZoom} fit={fit} maxHeight={maxHeight} maxWidth={maxWidth} direction={direction} pannable={pannable} panType={panType} zoomable={zoomable} readonly={readonly} onLayoutChange={onLayoutChange} selections={selections} onZoomChange={onZoomChange} onNodeLink={onNodeLink} onNodeLinkCheck={onNodeLinkCheck}>
    <InternalCanvas ref={ref} {...rest} />
  </CanvasProvider>
));
