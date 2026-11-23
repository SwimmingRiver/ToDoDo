// 한글(완성형+자모) 포함 여부
const HANGUL = /[가-힣ㄱ-ㆎ]/;
// Apple은 이름을 givenName/familyName으로 나눠 주므로 표시용 한 줄로 합친다.
// 한쪽이라도 한글이면 성+이름(공백 없음), 아니면 "이름 성".
export function formatAppleDisplayName(givenName, familyName) {
    const given = givenName?.trim() ?? "";
    const family = familyName?.trim() ?? "";
    if (!given && !family)
        return null;
    if (!given)
        return family;
    if (!family)
        return given;
    if (HANGUL.test(given) || HANGUL.test(family))
        return `${family}${given}`;
    return `${given} ${family}`;
}
