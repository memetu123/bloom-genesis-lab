import { HTMLAttributes } from "react";
import northStarSvg from "@/assets/north-star.svg";

interface NorthStarIconProps extends HTMLAttributes<HTMLImageElement> {
  size?: number;
}

/**
 * Custom North Star icon from uploaded SVG asset
 */
const NorthStarIcon = ({ size, className, ...props }: NorthStarIconProps) => {
  return (
    <img
      src={northStarSvg}
      className={className}
      alt=""
      {...props}
    />
  );
};

export default NorthStarIcon;
