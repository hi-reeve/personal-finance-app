// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { LocaleControls, LocaleProvider, useLocale } from "./locale";

function Sample() {
  const { t, money, date } = useLocale();
  return (
    <>
      <p data-testid="title">{t.preview_title()}</p>
      <p data-testid="rupiah">{money(25000, "IDR")}</p>
      <p data-testid="dollars">{money(123450, "USD")}</p>
      <p data-testid="date">{date("2026-10-18")}</p>
    </>
  );
}

function mount() {
  return render(
    <LocaleProvider>
      <LocaleControls />
      <Sample />
    </LocaleProvider>,
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("language and number format", () => {
  it("starts in English with comma-dot numbers", () => {
    mount();
    expect(text("title")).toBe("Personal finance");
    expect(text("rupiah")).toBe("Rp 25,000");
    expect(text("dollars")).toBe("$1,234.50");
    expect(text("date")).toBe("18 Oct 2026");
  });

  it("switches language without a reload or a URL change, and leaves number format alone", async () => {
    const url = location.href;
    mount();
    fireEvent.click(screen.getByLabelText("Bahasa Indonesia"));
    await waitFor(() => expect(text("title")).toBe("Keuangan pribadi"));
    expect(text("date")).toBe("18 Okt 2026");
    expect(text("rupiah")).toBe("Rp 25,000");
    expect(location.href).toBe(url);
  });

  it("switches number format without changing the language", async () => {
    mount();
    fireEvent.click(screen.getByLabelText("1.234,50"));
    await waitFor(() => expect(text("rupiah")).toBe("Rp 25.000"));
    expect(text("dollars")).toBe("$1.234,50");
    expect(text("title")).toBe("Personal finance");
  });

  it("remembers both choices on this device", async () => {
    const first = mount();
    fireEvent.click(screen.getByLabelText("Bahasa Indonesia"));
    fireEvent.click(screen.getByLabelText("1.234,50"));
    await waitFor(() => expect(text("rupiah")).toBe("Rp 25.000"));
    first.unmount();

    mount();
    expect(text("title")).toBe("Keuangan pribadi");
    expect(text("rupiah")).toBe("Rp 25.000");
  });

  it("falls back to the language's usual style when storage holds nonsense", () => {
    localStorage.setItem("pfa.number-format", "nonsense");
    mount();
    expect(text("title")).toBe("Personal finance");
    expect(text("rupiah")).toBe("Rp 25,000");
  });
});
