import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

/** iOS home-screen launch images: [width, height, pixel ratio] in CSS pixels. */
const IOS_STARTUP_SCREENS = [
  [375, 667, 2], // iPhone SE / 8
  [390, 844, 3], // iPhone 12 / 13 / 14
  [393, 852, 3], // iPhone 14 Pro / 15 / 16
  [402, 874, 3], // iPhone 16 Pro
  [430, 932, 3], // iPhone 14 Pro Max / 15 Plus / 16 Plus
] as const;

export const metadata: Metadata = {
  title: { default: "QuickSync", template: "%s · QuickSync" },
  description: "Copy anywhere. Access everywhere. Private text sync between your devices.",
  applicationName: "QuickSync",
  // A private app: keep it out of search engines.
  robots: { index: false, follow: false },
  // Stop iOS turning numbers in messages (OTPs, phone numbers) into tappable links.
  formatDetection: { telephone: false, email: false, address: false, date: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "QuickSync",
    statusBarStyle: "default",
    startupImage: IOS_STARTUP_SCREENS.map(([width, height, ratio]) => ({
      url: `/icons/splash-${width * ratio}x${height * ratio}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
    })),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch and home indicator; safe areas are padded in CSS.
  viewportFit: "cover",
  // Android Chrome: shrink the layout when the keyboard opens so nothing is hidden.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c10" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={400}>
            {children}
            <Toaster
              position="top-center"
              offset={{ top: "calc(env(safe-area-inset-top) + 64px)" }}
              mobileOffset={{ top: "calc(env(safe-area-inset-top) + 64px)" }}
              closeButton={false}
            />
          </TooltipProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
