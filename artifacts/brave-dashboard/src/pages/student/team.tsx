import { useGetMyTeam, useListMilestones } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { CalendarDays, Flag, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

export default function TeamProfile() {
  const { data: team, isLoading: teamLoading } = useGetMyTeam();
  const { data: milestones, isLoading: milestonesLoading } = useListMilestones({ teamId: team?.id || 0 }, { query: { enabled: !!team?.id } });

  if (teamLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (!team) return <div>Team not found</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-1/3 space-y-6">
          <Card>
            <CardContent className="pt-6 text-center">
              {team.photoUrl ? (
                <img src={team.photoUrl} alt={team.name} className="w-32 h-32 rounded-full mx-auto object-cover border-4 border-background shadow-sm" />
              ) : (
                <div className="w-32 h-32 rounded-full bg-primary/10 text-primary flex items-center justify-center text-4xl font-bold mx-auto shadow-sm">
                  {team.name.substring(0, 2).toUpperCase()}
                </div>
              )}
              <h2 className="text-2xl font-bold mt-4">{team.name}</h2>
              <p className="text-muted-foreground mt-1">{team.tagline}</p>
              
              <div className="flex justify-center gap-2 mt-4">
                <Badge variant="outline" className="capitalize">{team.status}</Badge>
                <Badge variant="secondary">{team.campusName}</Badge>
              </div>

              <div className="mt-6 flex justify-center">
                <Button variant="outline" className="w-full">Edit Profile</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Team Members</CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8"><Plus className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {team.members.map(member => (
                  <div key={member.userId} className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={member.profileImage || undefined} />
                      <AvatarFallback>{member.firstName[0]}{member.lastName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-medium truncate">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    {member.isLeader && <Badge variant="secondary" className="text-[10px] px-1.5 h-5">Leader</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-full md:w-2/3 space-y-6">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Milestone Timeline</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Track your team's journey</p>
              </div>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Update</Button>
            </CardHeader>
            <CardContent>
              {milestonesLoading ? (
                <div className="py-8 flex justify-center"><Spinner /></div>
              ) : !milestones || milestones.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Flag className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p>No milestones yet. Post your first update!</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-muted ml-3 space-y-8 pb-4">
                  {milestones.map((m, i) => (
                    <div key={m.id} className="relative pl-6 animate-in slide-in-from-right-8 duration-500 fade-in" style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}>
                      <div className="absolute w-3 h-3 bg-primary rounded-full -left-[7.5px] top-1.5 ring-4 ring-background" />
                      <div className="bg-muted/30 p-4 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-foreground">{m.title}</h4>
                          <div className="flex items-center text-xs text-muted-foreground">
                            <CalendarDays className="w-3 h-3 mr-1" />
                            {formatDate(m.date)}
                          </div>
                        </div>
                        {m.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.description}</p>}
                        {m.imageUrl && (
                          <div className="mt-3">
                            <img src={m.imageUrl} alt="Milestone" className="rounded-md border max-h-48 object-cover" />
                          </div>
                        )}
                        <div className="mt-3">
                          <Badge variant="outline" className="text-[10px]">{m.type === 'auto' ? 'System Generated' : 'Manual Update'}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
