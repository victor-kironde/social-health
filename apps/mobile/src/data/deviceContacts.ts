import { Contact, ContactField, ContactsSortOrder, requestPermissionsAsync } from 'expo-contacts';

export type ContactsAccess = { status: 'granted'; names: string[] } | { status: 'denied'; canAskAgain: boolean };

/**
 * Asks for contacts permission (only when the user chooses to import) and
 * reads display names, nothing else: no numbers, emails, photos or ids are
 * requested from the phone, let alone stored.
 */
export async function readContactNames(): Promise<ContactsAccess> {
  const permission = await requestPermissionsAsync();
  if (permission.status !== 'granted') return { status: 'denied', canAskAgain: permission.canAskAgain };
  const contacts = await Contact.getAllDetails([ContactField.FULL_NAME] as const, {
    sortOrder: ContactsSortOrder.GivenName,
  });
  return { status: 'granted', names: contacts.map((c) => c.fullName ?? '').filter(Boolean) };
}
