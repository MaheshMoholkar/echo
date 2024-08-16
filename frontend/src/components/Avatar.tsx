import { User } from "lucide-react";

function Avatar({ img }: { img?: string }) {
  return (
    <div className="flex items-center gap-4 cursor-pointer">
      {img ? (
        <img
          src={img}
          alt="profile"
          className="rounded-full"
          height={25}
          width={25}
        />
      ) : (
        <User />
      )}
    </div>
  );
}

export default Avatar;
