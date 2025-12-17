import { SVGProps } from "react";

interface NorthStarIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Custom 8-point star icon for North Star navigation
 * 4 primary points (longer, thicker) alternate with 4 secondary points (shorter, thinner)
 * Compass-like navigational feel
 */
const NorthStarIcon = ({ size = 24, className, ...props }: NorthStarIconProps) => {
  // Symmetric 8-pointed star with equal-length points
  // Classic compass rose / star shape with solid fill
  const cx = 12;
  const cy = 12;
  const outerRadius = 10;  // All 8 points extend to this radius
  const innerRadius = 4;   // Inner "pinch" points between the star points
  
  // Calculate the 16 vertices (8 outer points + 8 inner points)
  // Outer points at 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
  // Inner points between each pair
  const points: string[] = [];
  
  for (let i = 0; i < 8; i++) {
    // Outer point angle (starting from top, going clockwise)
    const outerAngle = (i * 45 - 90) * (Math.PI / 180);
    const outerX = cx + outerRadius * Math.cos(outerAngle);
    const outerY = cy + outerRadius * Math.sin(outerAngle);
    points.push(`${outerX.toFixed(2)},${outerY.toFixed(2)}`);
    
    // Inner point angle (22.5° after each outer point)
    const innerAngle = ((i * 45 + 22.5) - 90) * (Math.PI / 180);
    const innerX = cx + innerRadius * Math.cos(innerAngle);
    const innerY = cy + innerRadius * Math.sin(innerAngle);
    points.push(`${innerX.toFixed(2)},${innerY.toFixed(2)}`);
  }
  
  const pathData = `M ${points.join(' L ')} Z`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d={pathData}
        fill="currentColor"
      />
    </svg>
  );
};

export default NorthStarIcon;
