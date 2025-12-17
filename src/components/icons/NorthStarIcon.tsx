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
      <g fill="currentColor">
        {/* Long cardinal points (diamond) */}
        <polygon points="12,1.2 22.8,12 12,22.8 1.2,12" />
        {/* Short diagonal points (square) */}
        <polygon points="7.1,7.1 16.9,7.1 16.9,16.9 7.1,16.9" />
      </g>
    </svg>
  );
};

export default NorthStarIcon;
