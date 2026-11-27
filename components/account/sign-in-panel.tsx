"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailSignIn } from "./email-sign-in";
import { OtpSignIn } from "./otp-sign-in";
import { SocialButtons, useSocialNotice, useSocialProviders } from "./social-sign-in";

/**
 * ACC-01 sign-in / sign-up: mobile number (SMS code) or email (password, or a code), plus Google / Facebook when
 * their keys are saved. Each tab creates the account on first use. Callback messages (`?social=…`) and the
 * "verify your mobile to finish" step (`?link=…`) pick the right tab.
 */
export function SignInPanel({ onSignedIn }: { onSignedIn: () => void }) {
  const social = useSocialNotice();
  const providers = useSocialProviders();
  const [tab, setTab] = useState<"phone" | "email">("phone");

  useEffect(() => {
    // An address that already has an account: sign in with the email first, then link Google in Settings.
    if (social.notice && social.code === "email_in_use") queueMicrotask(() => setTab("email"));
  }, [social.notice, social.code]);

  return (
    <div className="flex flex-col gap-5">
      {social.link ? (
        <p role="status" className="border border-ink bg-white px-3 py-2.5 text-[13px] leading-[1.5]">
          <b>Almost there.</b> Verify your mobile number once to finish signing in with {social.link === "google" ? "Google" : "Facebook"}. We&apos;ll link the two, so next time one tap is enough.
        </p>
      ) : null}
      {social.notice ? (
        <p role="alert" className="text-[13px] font-semibold text-accent">
          {social.notice}
        </p>
      ) : null}

      <Tabs value={social.link ? "phone" : tab} onValueChange={(v) => setTab(v === "email" ? "email" : "phone")}>
        {!social.link ? (
          <TabsList aria-label="Sign in with">
            <TabsTrigger value="phone">Mobile number</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>
        ) : null}
        <TabsContent value="phone" className="pt-5">
          <OtpSignIn onSignedIn={onSignedIn} social={false} />
        </TabsContent>
        <TabsContent value="email" className="pt-5">
          <EmailSignIn onSignedIn={() => onSignedIn()} />
        </TabsContent>
      </Tabs>

      {!social.link && providers.length ? (
        <div className="space-y-2">
          <SocialButtons />
          <p className="text-[12px] leading-[1.5] text-ink-2">
            New here? Continuing with {providers.includes("google") ? "Google" : "Facebook"} creates your account, and you agree to our{" "}
            <Link href="/legal/terms" target="_blank" className="underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" target="_blank" className="underline underline-offset-2">
              Privacy Notice
            </Link>
            .
          </p>
        </div>
      ) : null}
    </div>
  );
}
