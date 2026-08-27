import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout from '../components/LegalLayout.jsx';
import { LEGAL_CONTACT, LEGAL_ENTITY, LEGAL_UPDATED } from '../legal/constants.js';

/**
 * Privacy Policy.
 *
 * NOT LEGAL ADVICE, AND NOT REVIEWED BY A LAWYER. See the note on TermsPage.
 *
 * The processor list and the retention section are the parts most likely to go
 * stale: they were written against the code as it stands — Supabase for auth,
 * database and file storage; OpenAI for extraction, transcription and
 * translation; Google Cloud Vision for OCR; Google for optional sign-in. If a
 * provider is added, changed or dropped, this page is part of that change, not
 * a follow-up to it.
 */
export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated={LEGAL_UPDATED}>
      <p className="legal__lead">
        This explains what Trevora holds about you, why, who else sees it, and what you can ask us
        to do with it. It is written to be read, not to be survived.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        {LEGAL_ENTITY} decides how and why your personal information is handled in Trevora, and is
        the personal information controller for the purposes of the Data Privacy Act of 2012
        (Republic Act No. 10173). Questions, requests and complaints go to{' '}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>

      <h2>2. What we hold</h2>
      <p>Because you gave it to us:</p>
      <ul>
        <li>
          <strong>Your account</strong> — first and last name, email address, and a password that
          is stored hashed and which we never see. If you sign in with Google we receive your name,
          email address and profile picture from Google.
        </li>
        <li>
          <strong>Your vehicles</strong> — make, model, body type, and optionally year, plate
          number, odometer reading and a photo.
        </li>
        <li>
          <strong>Your service records</strong> — dates, shops, work performed, parts, costs,
          odometer readings, and any notes you write.
        </li>
        <li>
          <strong>Receipt photographs</strong> you upload, kept so a record can be checked against
          the paper it came from.
        </li>
        <li>
          <strong>A profile photo</strong>, if you add one.
        </li>
      </ul>
      <p>Because of how the service works:</p>
      <ul>
        <li>
          <strong>Transcripts of voice notes.</strong> The audio itself is sent for transcription
          and is not stored by us — the text it produced is what is kept, and you see it before
          anything is saved.
        </li>
        <li>
          <strong>Sharing activity</strong> — which mechanic asked for access to which vehicle,
          when, what they said about themselves, and whether you approved it.
        </li>
        <li>
          <strong>Ordinary technical records</strong> needed to run and secure a web service.
        </li>
      </ul>
      <p>
        Some things stay in your browser and never reach us: which notifications you have read,
        whether you collapsed the sidebar, and your notification preferences. Clearing your
        browser data clears them.
      </p>

      <h2>3. Why we hold it</h2>
      <ul>
        <li>To give you the service you asked for — keeping and showing your vehicle history.</li>
        <li>To read your receipts and voice notes so you do not have to type everything.</li>
        <li>To let a mechanic you have approved read one vehicle&apos;s confirmed records.</li>
        <li>To keep accounts secure and to investigate misuse.</li>
      </ul>
      <p>
        We do not sell your information. We do not use it for advertising. We do not build a
        profile of you for any purpose other than running Trevora.
      </p>

      <h2>4. Who else sees it</h2>
      <p>
        <strong>Mechanics you approve.</strong> A mechanic who scans your code and whom you then
        approve can read the confirmed records of that one vehicle, read-only, for four hours.
        They see the vehicle label you chose, not your plate number, until access is approved. You
        can end it sooner. Nothing is visible before you approve.
      </p>
      <p>
        <strong>Service providers who process data on our instructions:</strong>
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — hosts the database, the sign-in system and the files you
          upload (receipt images, vehicle photos, profile photos).
        </li>
        <li>
          <strong>OpenAI</strong> — receives receipt text, voice audio and record text in order to
          extract fields, transcribe speech, translate a transcript when you ask for it, and answer
          a mechanic&apos;s question about a history you have shared.
        </li>
        <li>
          <strong>Google Cloud Vision</strong> — receives receipt images in order to read the text
          off them.
        </li>
        <li>
          <strong>Google</strong> — only if you choose to sign in with a Google account.
        </li>
      </ul>
      <p>
        These providers operate outside the Philippines, so your information is processed abroad.
        We share the minimum each one needs and we do not permit them to use it for their own
        purposes.
      </p>
      <p>
        We will also disclose information if the law requires it, and we will tell you when we are
        allowed to.
      </p>

      <h2>5. How long we keep it</h2>
      <p>
        Your records stay until you remove them or close your account — a service history is only
        useful if it is not quietly thrown away. Deleting a record removes it from your history.
      </p>
      <p>
        A mechanic&apos;s session expires four hours after you approve it; a share link expires 24
        hours after you create it. The record that a request happened, and how you answered it,
        stays with your account.
      </p>
      <p>
        <strong>To close your account and have its data removed, email us.</strong> There is no
        self-service delete inside Trevora yet, and we would rather say so plainly than describe a
        button that does not exist. We will act on the request within thirty days.
      </p>

      <h2>6. Your rights</h2>
      <p>Under the Data Privacy Act of 2012 you may:</p>
      <ul>
        <li>be told what we hold about you and be given a copy;</li>
        <li>have anything inaccurate corrected;</li>
        <li>object to how we handle it, and withdraw consent;</li>
        <li>have it erased or blocked in the circumstances the law provides for;</li>
        <li>be told if a breach put your information at serious risk;</li>
        <li>complain to the National Privacy Commission.</li>
      </ul>
      <p>
        Much of this you can do yourself: your name, email, password and photo are editable in
        account settings, and your records are yours to change. For anything else, write to{' '}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>

      <h2>7. Security</h2>
      <p>
        Sign-in is handled by Supabase Auth; passwords are stored hashed. Every request for your
        data is checked against the signed-in account, and a mechanic&apos;s session is checked for
        approval and expiry before any record is returned. Traffic is encrypted in transit.
      </p>
      <p>
        No system is perfectly secure, and saying otherwise would be a lie. If a breach puts your
        information at serious risk we will tell you and the National Privacy Commission as the law
        requires.
      </p>

      <h2>8. Children</h2>
      <p>
        Trevora is meant for vehicle owners and is not directed at children. If you believe a child
        has given us personal information, write to us and we will remove it.
      </p>

      <h2>9. Changes</h2>
      <p>
        If this policy changes in a way that materially affects you, we will tell you at the email
        address on your account before it takes effect. The date at the top says when it last
        changed.
      </p>

      <p className="legal__tail">
        See also the <Link to="/terms">Terms of Service</Link>.
      </p>
    </LegalLayout>
  );
}
