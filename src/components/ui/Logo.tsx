import Image from "next/image";

type LogoProps = {
  variant?: "banner" | "icon";
};

export function Logo({ variant = "banner" }: LogoProps) {
  if (variant === "icon") {
    return (
      <div className="flex items-center flex-shrink-0">
        <Image
          src="/granted-square.svg"
          alt="GRANTED"
          width={28}
          height={28}
          priority
        />
      </div>
    );
  }

  return (
    <div className="flex items-center flex-shrink-0">
      <Image
        src="/granted-banner.svg"
        alt="GRANTED"
        width={160}
        height={28}
        priority
        style={{ height: 28, width: 160 }}
      />
    </div>
  );
}
