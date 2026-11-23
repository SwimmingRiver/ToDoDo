import { useState } from "react";
import { styled } from "styled-components";
import type { User } from "firebase/auth";
import { colors } from "@/styles/colors";
import { userLabel } from "./userLabel";

interface UserAvatarProps {
  user: Pick<User, "displayName" | "email" | "photoURL"> | null;
  size: number;
}

/** 사진이 없거나 로드에 실패하면 이름 첫 글자 아바타로 대체한다. */
const UserAvatar = ({ user, size }: UserAvatarProps) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photoURL = user?.photoURL;

  if (photoURL && failedUrl !== photoURL) {
    return <Photo src={photoURL} alt="" $size={size} onError={() => setFailedUrl(photoURL)} />;
  }
  return (
    <Initial $size={size} aria-hidden="true">
      {userLabel(user).charAt(0)}
    </Initial>
  );
};

const Photo = styled.img<{ $size: number }>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
`;

const Initial = styled.span<{ $size: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: ${colors.brand.tint};
  color: ${colors.brand.strong};
  font-size: ${({ $size }) => Math.round($size * 0.5)}px;
  font-weight: 600;
  line-height: 1;
`;

export default UserAvatar;
