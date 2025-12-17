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
  // 8-point star with elongated vertical axis like the reference
  // Using a filled polygon path for the star shape
  const cx = 12;
  const cy = 12;
  
  // Lengths: vertical (N/S) longest, horizontal (E/W) medium, diagonals shortest
  const verticalLength = 11;   // North and South points
  const horizontalLength = 7;  // East and West points
  const diagonalLength = 5;    // Diagonal points
  const diagonalOffset = diagonalLength * 0.707;
  
  // Inner radius for the "pinch" between points
  const innerRadius = 1.5;
  const innerDiagonal = innerRadius * 0.707;

  // Build path: alternating outer points and inner points
  // Going clockwise from North
  const pathData = `
    M ${cx} ${cy - verticalLength}
    L ${cx + innerDiagonal} ${cy - innerDiagonal}
    L ${cx + diagonalOffset} ${cy - diagonalOffset}
    L ${cx + innerRadius} ${cy}
    L ${cx + horizontalLength} ${cy}
    L ${cx + innerRadius} ${cy}
    L ${cx + diagonalOffset} ${cy + diagonalOffset}
    L ${cx + innerDiagonal} ${cy + innerDiagonal}
    L ${cx} ${cy + verticalLength}
    L ${cx - innerDiagonal} ${cy + innerDiagonal}
    L ${cx - diagonalOffset} ${cy + diagonalOffset}
    L ${cx - innerRadius} ${cy}
    L ${cx - horizontalLength} ${cy}
    L ${cx - innerRadius} ${cy}
    L ${cx - diagonalOffset} ${cy - diagonalOffset}
    L ${cx - innerDiagonal} ${cy - innerDiagonal}
    Z
  `;

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
