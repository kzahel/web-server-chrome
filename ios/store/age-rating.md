# Age Rating Draft

All objectionable-content frequency fields appear to be **None** for the app's
own product content. The app has no advertising, chat, social feed, gambling,
loot boxes, parental controls, or age-assurance feature. It is not intended for
the Kids category, and the initial draft uses no rating override.

One capability requires attended judgment in Apple's current questionnaire:
**Unrestricted Web Access**. Apple defines this as letting users navigate to
any webpage inside the app or freely browse the web, including embedded-browser
functionality. 200 OK's `SFSafariViewController` preview starts at localhost
and has no general URL-entry control, but user-selected HTML can contain links
to external pages.

Conservative answer: **Yes**, yielding Apple's current 16+ global capability
rating on OS version 26 and 17+ on older OS versions. A **No** answer should be
used only after the maintainer is satisfied that the bounded localhost preview
does not meet Apple's definition, or after navigation is technically restricted
to the local server and revalidated. Do not guess during submission.

The app does not broadly distribute or provide discovery of content created by
other users, so **User-Generated Content** is expected to be No. Confirm the
calculated global and regional results in the live questionnaire before saving.
