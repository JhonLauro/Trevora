import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout from '../components/LegalLayout.jsx';
import { LEGAL_CONTACT, LEGAL_ENTITY, LEGAL_UPDATED } from '../legal/constants.js';

/**
 * Terms of Service.
 *
 * NOT LEGAL ADVICE, AND NOT REVIEWED BY A LAWYER. Every factual claim in here
 * was checked against the code — the four-hour session, the 24-hour link, the
 * absence of self-service account deletion — so it describes this system
 * accurately rather than describing a generic SaaS. Accuracy is not the same
 * thing as legal sufficiency. Have someone qualified read it before this is
 * used by anyone outside the team, and fill the placeholders in
 * src/legal/constants.js first.
 */
export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated={LEGAL_UPDATED}>
      <p className="legal__lead">
        These terms cover your use of Trevora, a service for keeping a vehicle&apos;s repair and
        maintenance history and sharing it with a mechanic when you choose to. By creating an
        account you agree to them.
      </p>

      <h2>1. Who provides Trevora</h2>
      <p>
        Trevora is operated by {LEGAL_ENTITY}. You can reach us at{' '}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>

      <h2>2. Your account</h2>
      <p>
        You need an account to use Trevora. You may sign up with an email address and password, or
        with a Google account. You are responsible for keeping your password to yourself and for
        what happens under your account.
      </p>
      <p>
        You must be old enough to enter a contract where you live. Accounts are for one person —
        do not share your sign-in with somebody else. If you want another person to see a
        vehicle&apos;s history, use the sharing feature described in section 5, which is what it
        is for.
      </p>

      <h2>3. What you put in, and who owns it</h2>
      <p>
        Your records are yours. Photographs of receipts, voice notes, service details, vehicle
        details and photos — you keep every right in them that you had before. We do not claim
        ownership.
      </p>
      <p>
        You give us permission to store and process that material for the purpose of running the
        service: reading a receipt, transcribing a voice note, showing you a history, and showing
        it to a mechanic you have approved. Nothing broader. We do not sell it, and we do not use
        it to advertise to you.
      </p>
      <p>
        Only upload material you are entitled to upload. Do not use Trevora to store somebody
        else&apos;s documents without their agreement.
      </p>

      <h2>4. What Trevora does and does not do</h2>
      <p>
        Trevora reads receipts and voice notes and proposes values for the fields of a service
        record. <strong>It gets things wrong.</strong> Every extracted value is shown to you with a
        note saying where it came from, and nothing is saved to your history until you confirm it.
        The record that results is the one you confirmed, not the one a machine produced.
      </p>
      <p>
        <strong>Trevora does not tell you when a service is next due.</strong> There are no
        intervals, no reminders and no predictions. It keeps a record of what happened. Deciding
        what your vehicle needs is between you and your mechanic.
      </p>
      <p>
        Nothing in Trevora is advice — not mechanical, not safety, not financial. Do not rely on
        it as the sole record for a warranty claim, a sale, an insurance matter or a legal
        dispute. Keep your paper.
      </p>

      <h2>5. Sharing a history with a mechanic</h2>
      <p>
        Mechanics do not have accounts. You generate a code for one vehicle; a mechanic scans it
        and sends you a request. <strong>Scanning grants nothing.</strong> Until you approve that
        request, no records are visible.
      </p>
      <p>
        When you approve, that mechanic gets read-only access to the confirmed records of that one
        vehicle for four hours, after which it ends by itself. You can end it sooner. The share
        link a code is generated from expires 24 hours after you create it. A mechanic with access
        cannot add, change or delete anything.
      </p>
      <p>
        Approving a request means choosing to show your information to that person. Approve
        requests from people you are dealing with, and only for as long as you need to.
      </p>

      <h2>6. Fair use</h2>
      <p>Do not use Trevora to:</p>
      <ul>
        <li>store or share material you have no right to;</li>
        <li>impersonate someone else when requesting access to a vehicle&apos;s history;</li>
        <li>attempt to reach records belonging to an account that is not yours;</li>
        <li>interfere with the service, or automate access to it at a volume that degrades it for
          other people.</li>
      </ul>
      <p>
        We may suspend an account that does these things. Where the reason is not a safety or
        legal emergency, we will tell you why.
      </p>

      <h2>7. Availability</h2>
      <p>
        Trevora is provided as it is. We do not promise it will be available without interruption,
        that extraction will reach any particular level of accuracy, or that it will be free of
        faults. Features may change, and features may be withdrawn.
      </p>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential loss arising
        from your use of Trevora — including a decision you made on the strength of a record.
        Nothing here limits liability that cannot be limited by law.
      </p>

      <h2>8. Ending it</h2>
      <p>
        You may stop using Trevora at any time. To close your account and have its data removed,
        email <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> — there is no button for this
        inside the app yet, and we would rather say so than imply otherwise.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms. If a change materially affects your rights we will tell you
        before it takes effect, at the email address on your account. The date at the top of this
        page always says when it was last changed.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of the Republic of the Philippines, and the courts of
        the Philippines have jurisdiction over any dispute arising from them.
      </p>

      <p className="legal__tail">
        See also the <Link to="/privacy">Privacy Policy</Link>, which explains what we hold and who
        else sees it.
      </p>
    </LegalLayout>
  );
}
