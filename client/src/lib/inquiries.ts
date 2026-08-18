import { api } from "./api";
import type { Inquiry } from "@shared/types";

export type { Inquiry };

export async function getInquiries(): Promise<Inquiry[]> {
  try {
    return (await api.get<{ inquiries: Inquiry[] }>("/inquiries")).inquiries;
  } catch {
    return [];
  }
}

export async function addInquiry(input: {
  userId: string | null;
  name: string;
  email: string;
  title: string;
  content: string;
}): Promise<string | null> {
  try {
    const { inquiry } = await api.post<{ inquiry: Inquiry }>("/inquiries", input);
    return inquiry.id;
  } catch {
    return null;
  }
}

export async function answerInquiry(id: string, answer: string): Promise<boolean> {
  try {
    await api.post<{ success: boolean }>(`/inquiries/${id}/answer`, { answer });
    return true;
  } catch {
    return false;
  }
}
