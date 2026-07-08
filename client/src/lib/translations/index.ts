import { common } from "./common";
import { home } from "./home";
import { diary } from "./diary";
import { community } from "./community";
import { mypage } from "./mypage";
import { auth } from "./auth";

export const translations = {
  ko: {
    ...common.ko,
    home: home.ko,
    diary: diary.ko,
    community: community.ko,
    mypage: mypage.ko,
    auth: auth.ko,
  },
  en: {
    ...common.en,
    home: home.en,
    diary: diary.en,
    community: community.en,
    mypage: mypage.en,
    auth: auth.en,
  },
};
