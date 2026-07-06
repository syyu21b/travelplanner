/**
 * 국내 주요 도시 좌표 (시청/중심가 기준 근사치).
 * Open-Meteo의 지오코딩 API는 한글 지명 검색 정확도가 낮아(예: "서울" 검색 시 결과 없음),
 * 날씨 조회에 필요한 정도의 정확도로 자체 목록을 우선 사용하고, 목록에 없는 지명만 지오코딩 API로 보완한다.
 */
export interface KoreaCity {
  name: string;
  lat: number;
  lng: number;
}

export const KOREA_CITIES: KoreaCity[] = [
  { name: "서울특별시", lat: 37.5665, lng: 126.978 },
  { name: "부산광역시", lat: 35.1796, lng: 129.0756 },
  { name: "대구광역시", lat: 35.8714, lng: 128.6014 },
  { name: "인천광역시", lat: 37.4563, lng: 126.7052 },
  { name: "광주광역시", lat: 35.1595, lng: 126.8526 },
  { name: "대전광역시", lat: 36.3504, lng: 127.3845 },
  { name: "울산광역시", lat: 35.5384, lng: 129.3114 },
  { name: "세종특별자치시", lat: 36.4801, lng: 127.289 },
  { name: "수원시", lat: 37.2636, lng: 127.0286 },
  { name: "성남시", lat: 37.4201, lng: 127.1262 },
  { name: "고양시", lat: 37.6584, lng: 126.832 },
  { name: "용인시", lat: 37.2411, lng: 127.1776 },
  { name: "부천시", lat: 37.5035, lng: 126.766 },
  { name: "안산시", lat: 37.3219, lng: 126.8309 },
  { name: "안양시", lat: 37.3943, lng: 126.9568 },
  { name: "남양주시", lat: 37.636, lng: 127.2165 },
  { name: "화성시", lat: 37.1996, lng: 126.831 },
  { name: "평택시", lat: 36.9921, lng: 127.1129 },
  { name: "의정부시", lat: 37.7381, lng: 127.0338 },
  { name: "시흥시", lat: 37.3799, lng: 126.8027 },
  { name: "파주시", lat: 37.7599, lng: 126.78 },
  { name: "김포시", lat: 37.6153, lng: 126.7159 },
  { name: "광명시", lat: 37.4786, lng: 126.8646 },
  { name: "군포시", lat: 37.3616, lng: 126.9352 },
  { name: "하남시", lat: 37.5393, lng: 127.2148 },
  { name: "오산시", lat: 37.1498, lng: 127.0772 },
  { name: "이천시", lat: 37.2724, lng: 127.435 },
  { name: "양주시", lat: 37.7853, lng: 127.0456 },
  { name: "구리시", lat: 37.5943, lng: 127.1296 },
  { name: "안성시", lat: 37.0079, lng: 127.2797 },
  { name: "포천시", lat: 37.8949, lng: 127.2004 },
  { name: "여주시", lat: 37.2984, lng: 127.6373 },
  { name: "동두천시", lat: 37.9034, lng: 127.0606 },
  { name: "과천시", lat: 37.4292, lng: 126.9877 },
  { name: "춘천시", lat: 37.8813, lng: 127.7298 },
  { name: "원주시", lat: 37.3422, lng: 127.9202 },
  { name: "강릉시", lat: 37.7519, lng: 128.8761 },
  { name: "동해시", lat: 37.5247, lng: 129.1143 },
  { name: "태백시", lat: 37.1641, lng: 128.9856 },
  { name: "속초시", lat: 38.207, lng: 128.5918 },
  { name: "삼척시", lat: 37.45, lng: 129.1655 },
  { name: "청주시", lat: 36.6424, lng: 127.489 },
  { name: "충주시", lat: 36.991, lng: 127.9259 },
  { name: "제천시", lat: 37.1326, lng: 128.1911 },
  { name: "천안시", lat: 36.8151, lng: 127.1139 },
  { name: "공주시", lat: 36.4465, lng: 127.1189 },
  { name: "보령시", lat: 36.3332, lng: 126.6128 },
  { name: "아산시", lat: 36.7898, lng: 127.0018 },
  { name: "서산시", lat: 36.7846, lng: 126.4503 },
  { name: "논산시", lat: 36.1871, lng: 127.0987 },
  { name: "계룡시", lat: 36.2745, lng: 127.2487 },
  { name: "당진시", lat: 36.8929, lng: 126.6284 },
  { name: "전주시", lat: 35.8242, lng: 127.148 },
  { name: "군산시", lat: 35.9678, lng: 126.7369 },
  { name: "익산시", lat: 35.9483, lng: 126.9575 },
  { name: "정읍시", lat: 35.5699, lng: 126.8556 },
  { name: "남원시", lat: 35.4164, lng: 127.3906 },
  { name: "김제시", lat: 35.8035, lng: 126.8809 },
  { name: "목포시", lat: 34.8118, lng: 126.3922 },
  { name: "여수시", lat: 34.7604, lng: 127.6622 },
  { name: "순천시", lat: 34.9506, lng: 127.4872 },
  { name: "나주시", lat: 35.016, lng: 126.7108 },
  { name: "광양시", lat: 34.9406, lng: 127.6958 },
  { name: "포항시", lat: 36.019, lng: 129.3435 },
  { name: "경주시", lat: 35.8562, lng: 129.2247 },
  { name: "김천시", lat: 36.1398, lng: 128.1136 },
  { name: "안동시", lat: 36.5684, lng: 128.7294 },
  { name: "구미시", lat: 36.1195, lng: 128.3446 },
  { name: "영주시", lat: 36.8056, lng: 128.6239 },
  { name: "영천시", lat: 35.9733, lng: 128.9386 },
  { name: "상주시", lat: 36.4109, lng: 128.159 },
  { name: "문경시", lat: 36.5867, lng: 128.1868 },
  { name: "경산시", lat: 35.825, lng: 128.7412 },
  { name: "창원시", lat: 35.228, lng: 128.6811 },
  { name: "진주시", lat: 35.18, lng: 128.1076 },
  { name: "통영시", lat: 34.8544, lng: 128.4331 },
  { name: "사천시", lat: 35.0036, lng: 128.0642 },
  { name: "김해시", lat: 35.2285, lng: 128.8894 },
  { name: "밀양시", lat: 35.5039, lng: 128.7469 },
  { name: "거제시", lat: 34.8806, lng: 128.6212 },
  { name: "양산시", lat: 35.335, lng: 129.0378 },
  { name: "제주시", lat: 33.4996, lng: 126.5312 },
  { name: "서귀포시", lat: 33.2541, lng: 126.5601 },
];

/** 접미사를 뗀 이름으로도 매칭될 수 있도록 양방향 부분일치 검색 */
export function searchKoreaCities(query: string): KoreaCity[] {
  const q = query.trim();
  if (!q) return [];
  const suffixPattern = /(특별자치시|특별자치도|특별시|광역시|시|군|구)$/;
  return KOREA_CITIES.filter(c => {
    if (c.name.includes(q)) return true;
    const shortName = c.name.replace(suffixPattern, "");
    return shortName.length > 0 && q.includes(shortName);
  });
}
