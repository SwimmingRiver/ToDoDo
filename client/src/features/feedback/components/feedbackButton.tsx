import { useState } from "react";
import useModal from "@/shared/hooks/useModal";
import { useSubmitFeedback } from "../hooks";
import { FEEDBACK_CONTENT_MAX_LENGTH } from "../api";
import {
  TriggerButton,
  Overlay,
  Container,
  Title,
  Textarea,
  CharCount,
  ErrorMessage,
  SuccessMessage,
  ButtonGroup,
  Button,
} from "./feedbackButton.styles";

const FeedbackButton = () => {
  const { isOpen, setIsOpen } = useModal();
  const [content, setContent] = useState("");
  const { mutate, isPending, isSuccess, isError, reset } = useSubmitFeedback();

  const handleClose = () => {
    setIsOpen(false);
    setContent("");
    reset();
  };

  const handleSubmit = () => {
    if (!content.trim() || isPending) return;
    mutate(content, {
      onSuccess: () => {
        setTimeout(handleClose, 1200);
      },
    });
  };

  return (
    <>
      <TriggerButton onClick={() => setIsOpen(true)}>
        의견 보내기
      </TriggerButton>
      {isOpen && (
        <Overlay onClick={handleClose}>
          <Container onClick={(e) => e.stopPropagation()}>
            <Title>의견 보내기</Title>
            <Textarea
              value={content}
              maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
              placeholder="자유롭게 의견을 남겨주세요"
              onChange={(e) => setContent(e.target.value)}
              disabled={isPending || isSuccess}
              autoFocus
            />
            <CharCount>
              {content.length} / {FEEDBACK_CONTENT_MAX_LENGTH}
            </CharCount>
            {isError && (
              <ErrorMessage>
                전송에 실패했습니다. 잠시 후 다시 시도해주세요.
              </ErrorMessage>
            )}
            {isSuccess && (
              <SuccessMessage>
                감사합니다! 의견이 전달되었습니다.
              </SuccessMessage>
            )}
            <ButtonGroup>
              <Button onClick={handleClose}>닫기</Button>
              <Button
                $variant="primary"
                onClick={handleSubmit}
                disabled={!content.trim() || isPending || isSuccess}
              >
                {isPending ? "전송 중..." : "제출"}
              </Button>
            </ButtonGroup>
          </Container>
        </Overlay>
      )}
    </>
  );
};

export default FeedbackButton;
