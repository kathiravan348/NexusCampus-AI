import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  MESSAGE_KEYS,
  SOURCE_LOCALE,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPhone,
  isPseudoLocale,
  useText,
  type DisplayCalendar,
  type MessageKey,
  type TextValues,
} from "@nexus/i18n";

const SAMPLE_VALUES: Partial<Record<MessageKey, TextValues>> = {
  "common.syncPending": { count: 3 },
};

const CALENDARS: readonly { id: DisplayCalendar; label: string }[] = [
  { id: "gregory", label: "Gregorian" },
  { id: "islamic-umalqura", label: "Hijri (Umm al-Qura)" },
  { id: "hebrew", label: "Hebrew" },
  { id: "indian", label: "Indian National" },
];

const MONEY_SAMPLES = [
  { minor: 125000, currency: "INR", label: "Indian Rupee (2 decimals)" },
  { minor: 125000, currency: "USD", label: "US Dollar (2 decimals)" },
  { minor: 1250, currency: "JPY", label: "Japanese Yen (0 decimals)" },
  { minor: 125000, currency: "KWD", label: "Kuwaiti Dinar (3 decimals)" },
] as const;

const TIMEZONE_SAMPLES = [
  { timeZone: "Asia/Kolkata", label: "India (Asia/Kolkata)" },
  { timeZone: "Asia/Dubai", label: "UAE (Asia/Dubai)" },
  { timeZone: "America/New_York", label: "US East (America/New_York)" },
  { timeZone: "UTC", label: "UTC" },
] as const;

const PHONE_SAMPLES = [
  { e164: "+919876543210", label: "India (+91)" },
  { e164: "+971501234567", label: "UAE (+971)" },
  { e164: "+14155550132", label: "US (+1)" },
  { e164: "+442079460958", label: "UK (+44)" },
] as const;

const SAMPLE_DATE = "2026-11-19";
const SAMPLE_TIMESTAMP = "2026-11-19T08:30:00Z";

function TextsCatalogue({ locale, typePack }: { locale: string; typePack: string }) {
  const t = useText();
  const formatLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  return (
    <main className="mx-auto max-w-5xl space-y-6 text-text-primary">
      <header className="space-y-1">
        <h1 className="text-page-title">i18n — Message Catalogue &amp; Formatters</h1>
        <p className="text-body-sm text-text-secondary">
          Toggle Locale (<code className="font-mono">{locale}</code>) and Type (
          <code className="font-mono">{typePack}</code>) in the toolbar to inspect translations,
          RTL, pseudo-localisation, and terminology packs.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="texts-messages-heading">
        <h2 id="texts-messages-heading" className="text-section-title">
          Message Keys ({MESSAGE_KEYS.length})
        </h2>
        <div
          role="region"
          aria-label="Message keys table"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard access for scrollable table
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-border-default bg-bg-surface"
        >
          <table className="w-full border-collapse text-start text-body-sm">
            <thead>
              <tr className="border-b border-border-default bg-bg-raised text-label uppercase text-text-muted">
                <th scope="col" className="px-4 py-3 text-start">
                  Key
                </th>
                <th scope="col" className="px-4 py-3 text-start">
                  Rendered text
                </th>
              </tr>
            </thead>
            <tbody>
              {MESSAGE_KEYS.map((key) => (
                <tr key={key} className="border-b border-border-default last:border-b-0">
                  <td className="px-4 py-2 font-mono text-number-sm text-text-muted">{key}</td>
                  <td className="px-4 py-2 text-body text-text-primary">
                    {t(key, SAMPLE_VALUES[key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3" aria-labelledby="texts-money-heading">
          <h2 id="texts-money-heading" className="text-section-title">
            Money (minor units)
          </h2>
          <div className="divide-y divide-border-default rounded-lg border border-border-default bg-bg-surface px-4">
            {MONEY_SAMPLES.map((sample) => (
              <div key={sample.currency} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-body-sm text-text-primary">{sample.label}</div>
                  <div className="font-mono text-number-sm text-text-muted">
                    {sample.minor} {sample.currency}
                  </div>
                </div>
                <div className="font-mono text-number text-text-primary">
                  {formatMoney(sample.minor, sample.currency, formatLocale)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3" aria-labelledby="texts-calendars-heading">
          <h2 id="texts-calendars-heading" className="text-section-title">
            Calendars ({SAMPLE_DATE})
          </h2>
          <div className="divide-y divide-border-default rounded-lg border border-border-default bg-bg-surface px-4">
            {CALENDARS.map((cal) => (
              <div key={cal.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-body-sm text-text-primary">{cal.label}</div>
                  <div className="font-mono text-number-sm text-text-muted">{cal.id}</div>
                </div>
                <div className="font-mono text-number-sm text-text-primary">
                  {formatDate(SAMPLE_DATE, {
                    locale: formatLocale,
                    calendar: cal.id,
                    dateStyle: "long",
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3" aria-labelledby="texts-datetime-heading">
          <h2 id="texts-datetime-heading" className="text-section-title">
            Date &amp; Time ({SAMPLE_TIMESTAMP})
          </h2>
          <div className="divide-y divide-border-default rounded-lg border border-border-default bg-bg-surface px-4">
            {TIMEZONE_SAMPLES.map((zone) => (
              <div key={zone.timeZone} className="flex items-center justify-between gap-3 py-3">
                <div className="text-body-sm text-text-primary">{zone.label}</div>
                <div className="font-mono text-number-sm text-text-primary">
                  {formatDateTime(SAMPLE_TIMESTAMP, {
                    locale: formatLocale,
                    timeZone: zone.timeZone,
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3" aria-labelledby="texts-phones-heading">
          <h2 id="texts-phones-heading" className="text-section-title">
            Phone Numbers (E.164)
          </h2>
          <div className="divide-y divide-border-default rounded-lg border border-border-default bg-bg-surface px-4">
            {PHONE_SAMPLES.map((phone) => (
              <div key={phone.e164} className="flex items-center justify-between gap-3 py-3">
                <div className="text-body-sm text-text-primary">{phone.label}</div>
                <div dir="ltr" className="font-mono text-number-sm text-text-primary">
                  {formatPhone(phone.e164)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

const meta: Meta = {
  title: "Foundations/Texts",
};

export default meta;

type Story = StoryObj;

export const CatalogueAndFormatters: Story = {
  render: (_args, context) => (
    <TextsCatalogue
      locale={String(context.globals["locale"] ?? SOURCE_LOCALE)}
      typePack={String(context.globals["typePack"] ?? "k12")}
    />
  ),
};
