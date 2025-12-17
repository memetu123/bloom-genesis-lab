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
  const center = 12;
  const primaryLength = 10; // Length of main cardinal points
  const secondaryLength = 6; // Length of diagonal points
  
  // Primary points (N, E, S, W) - thicker stroke
  const primaryPoints = [
    { x1: center, y1: center, x2: center, y2: center - primaryLength }, // North
    { x1: center, y1: center, x2: center + primaryLength, y2: center }, // East
    { x1: center, y1: center, x2: center, y2: center + primaryLength }, // South
    { x1: center, y1: center, x2: center - primaryLength, y2: center }, // West
  ];
  
  // Secondary points (NE, SE, SW, NW) - thinner stroke
  const diagonalOffset = secondaryLength * 0.707; // cos(45°) ≈ 0.707
  const secondaryPoints = [
    { x1: center, y1: center, x2: center + diagonalOffset, y2: center - diagonalOffset }, // NE
    { x1: center, y1: center, x2: center + diagonalOffset, y2: center + diagonalOffset }, // SE
    { x1: center, y1: center, x2: center - diagonalOffset, y2: center + diagonalOffset }, // SW
    { x1: center, y1: center, x2: center - diagonalOffset, y2: center - diagonalOffset }, // NW
  ];

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
      {/* Primary cardinal points - thicker */}
      {primaryPoints.map((point, i) => (
        <line
          key={`primary-${i}`}
          x1={point.x1}
          y1={point.y1}
          x2={point.x2}
          y2={point.y2}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      ))}
      
      {/* Secondary diagonal points - thinner */}
      {secondaryPoints.map((point, i) => (
        <line
          key={`secondary-${i}`}
          x1={point.x1}
          y1={point.y1}
          x2={point.x2}
          y2={point.y2}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}
      
      {/* Center dot for compass feel */}
      <circle
        cx={center}
        cy={center}
        r={1.5}
        fill="currentColor"
      />
    </svg>
  );
};

export default NorthStarIcon;
