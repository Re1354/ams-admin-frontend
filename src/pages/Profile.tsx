import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, Camera, Loader2, Mail, Save, Shield, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';

import { UserAvatar } from '../components/UserAvatar';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuth } from '../contexts/AuthContext';

const EMPTY_FORM = {
  employee_id: '',
  full_name: '',
  designation: '',
  personal_email: '',
  university_email: '',
  contact: '',
};

const getErrorMessage = (error: any) => {
  const fieldErrors = error?.errors;
  if (fieldErrors && typeof fieldErrors === 'object') {
    const first = Object.values(fieldErrors).flat().find(Boolean);
    if (first) return String(first);
  }
  return error?.message || 'Failed to update profile';
};

export default function Profile() {
  const { user, refreshProfile, updateProfile } = useAuth();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    refreshProfile()
      .catch((error) => {
        if (mounted) toast.error(getErrorMessage(error));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
    // Profile refreshes once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    setFormData({
      employee_id: user.employee_id || '',
      full_name: user.full_name || '',
      designation: user.designation || '',
      personal_email: user.personal_email || '',
      university_email: user.university_email || user.email || '',
      contact: user.contact || '',
    });
  }, [user]);

  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(selectedImage);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedImage]);

  const previewUser = useMemo(
    () => ({ ...(user || {}), image: previewUrl || user?.image }),
    [previewUrl, user],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!formData.university_email.trim()) {
      toast.error('University email is required.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => payload.append(key, value.trim()));
      if (selectedImage) payload.append('image', selectedImage);

      await updateProfile(payload);
      setSelectedImage(null);
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profile…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="h-28 bg-gradient-to-r from-[#0D1B4C] via-[#1E3A8A] to-[#2E3094]" />
        <CardContent className="relative px-6 pb-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <UserAvatar
              user={previewUser}
              showInitial
              className="-mt-12 h-28 w-28 border-4 border-white bg-white shadow-md"
              fallbackClassName="text-3xl font-semibold"
            />
            <div className="min-w-0 flex-1 pb-1">
              <h2 className="truncate text-2xl font-semibold text-slate-900">
                {user?.full_name || user?.username}
              </h2>
              <p className="text-sm text-slate-500">@{user?.username}</p>
            </div>
            <Badge variant="secondary" className="w-fit capitalize">
              {user?.role_details?.role_name || 'No role'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
            <CardDescription>Update your personal information and profile image.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="profile-image">Profile Image</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="profile-image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => setSelectedImage(event.target.files?.[0] || null)}
                    disabled={isSaving}
                  />
                  <Camera className="h-5 w-5 shrink-0 text-slate-400" />
                </div>
                <p className="text-xs text-slate-500">JPG, PNG, WEBP, or GIF up to 5 MB.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-employee-id">Employee ID</Label>
                  <Input
                    id="profile-employee-id"
                    value={formData.employee_id}
                    onChange={(event) => setFormData((current) => ({ ...current, employee_id: event.target.value }))}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-full-name">Full Name</Label>
                  <Input
                    id="profile-full-name"
                    value={formData.full_name}
                    onChange={(event) => setFormData((current) => ({ ...current, full_name: event.target.value }))}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-designation">Designation</Label>
                  <Input
                    id="profile-designation"
                    value={formData.designation}
                    onChange={(event) => setFormData((current) => ({ ...current, designation: event.target.value }))}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-contact">Contact</Label>
                  <Input
                    id="profile-contact"
                    value={formData.contact}
                    onChange={(event) => setFormData((current) => ({ ...current, contact: event.target.value }))}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-university-email">University Email *</Label>
                  <Input
                    id="profile-university-email"
                    type="email"
                    value={formData.university_email}
                    onChange={(event) => setFormData((current) => ({ ...current, university_email: event.target.value }))}
                    disabled={isSaving}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-personal-email">Personal Email</Label>
                  <Input
                    id="profile-personal-email"
                    type="email"
                    value={formData.personal_email}
                    onChange={(event) => setFormData((current) => ({ ...current, personal_email: event.target.value }))}
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSaving} className="bg-[#2E3094] hover:bg-[#242677]">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Profile
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Account Access</CardTitle>
            <CardDescription>Managed by an administrator.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex gap-3">
              <UserRound className="mt-0.5 h-4 w-4 text-blue-600" />
              <div><p className="text-xs text-slate-500">Username</p><p className="font-medium">{user?.username}</p></div>
            </div>
            <div className="flex gap-3">
              <Shield className="mt-0.5 h-4 w-4 text-indigo-600" />
              <div><p className="text-xs text-slate-500">Role</p><p className="font-medium capitalize">{user?.role_details?.role_name || '—'}</p></div>
            </div>
            <div className="flex gap-3">
              <Building2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-xs text-slate-500">Faculty / Department</p>
                <p className="font-medium">{user?.faculty_details?.faculty_name || user?.department_details?.department_name || '—'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 text-amber-600" />
              <div><p className="text-xs text-slate-500">Access Type</p><p className="font-medium capitalize">{user?.access_type?.toLowerCase() || '—'}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
