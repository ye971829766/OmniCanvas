import { ref } from 'vue';

export type ShapeType = 'rect' | 'ellipse' | 'polygon' | 'star' | 'line';

export const selectedShapeType = ref<ShapeType>('rect');
export const shapeSides = ref<number>(3);
export const shapeCorners = ref<number>(5);
export const shapeInnerRadius = ref<number>(0.382);
