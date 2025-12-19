import { SVGProps } from "react";
import northStarSvg from "@/assets/north-star.svg";

interface NorthStarIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Custom North Star icon from uploaded SVG asset
 */
const NorthStarIcon = ({ size = 24, className, ...props }: NorthStarIconProps) => {
  return (
    <img
      src={northStarSvg}
      width={size}
      height={size}
      className={className}
      alt=""
      style={{ display: 'inline-block' }}
    />
  );
};

export default NorthStarIcon;
