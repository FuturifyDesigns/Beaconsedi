<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep operations and management surfaces admin-only because they expose sensitive emergency coordination controls.
- Navigation handoff uses the documented Blue Light Maps deep links (`blm://nav`/`blm://map`, default profile `responsetruck`) as the primary mobile choice, with Google Maps as the fallback, because Blue Light Maps publishes no web map SDK or self-serve API — embedded dashboard maps stay on Google Maps until an enterprise SDK agreement exists.
- Ambulance referrals live in new `referrals`/`referral_status_history`/`referral_handovers` tables but reuse `hospitals` (facilities), `responder_units`/`responder_locations` (fleet + GPS), and role-gated server functions — never create parallel facility, vehicle, or tracking tables.
