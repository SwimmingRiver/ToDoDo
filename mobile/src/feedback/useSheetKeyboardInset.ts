import { useEffect, useRef, useState } from "react";
import { Keyboard, type KeyboardEvent, LayoutAnimation, Platform, type View } from "react-native";

/**
 * iOS pageSheet 모달 안에서 키보드에 가려지는 만큼의 하단 인셋을 계산한다.
 *
 * KeyboardAvoidingView를 쓰지 않는 이유: KAV는 부모 기준 onLayout 좌표(frame.y)를
 * 화면 기준 키보드 좌표(screenY)와 비교한다. 전체 화면이면 둘이 같지만, pageSheet는
 * 화면 맨 위보다 아래(상태바+여백)에서 시작하므로 그 오프셋만큼 겹침을 적게 계산해
 * 하단의 보내기 버튼이 키보드 아래에 남았다. 여기서는 키보드 이벤트 시점에
 * measureInWindow로 창 좌표를 재므로(시트 애니메이션도 끝난 뒤) 기기·시트 위치와
 * 무관하게 정확하다.
 *
 * ref를 단 뷰는 키보드와 무관하게 크기가 고정된 바깥 컨테이너여야 하고, 반환한
 * inset은 그 컨테이너의 paddingBottom으로 준다(패딩은 바깥 크기를 바꾸지 않으므로
 * 측정값이 인셋에 되먹임되지 않는다). Android는 adjustResize가 처리하므로 0이다.
 */
export const useSheetKeyboardInset = () => {
  const ref = useRef<View>(null);
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const animate = ({ duration, easing }: KeyboardEvent) => {
      if (!duration) return;
      // RCTLayoutAnimation의 최소 duration이 10이라 KAV와 같은 값으로 맞춘다.
      const ms = Math.max(duration, 10);
      LayoutAnimation.configureNext({
        duration: ms,
        update: { duration: ms, type: LayoutAnimation.Types[easing] ?? LayoutAnimation.Types.keyboard },
      });
    };

    const onChange = (event: KeyboardEvent) => {
      ref.current?.measureInWindow((_x, y, _width, height) => {
        animate(event);
        setInset(Math.max(0, y + height - event.endCoordinates.screenY));
      });
    };
    const onHide = (event: KeyboardEvent) => {
      animate(event);
      setInset(0);
    };

    const subs = [
      Keyboard.addListener("keyboardWillChangeFrame", onChange),
      Keyboard.addListener("keyboardWillHide", onHide),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, []);

  return { ref, inset };
};
