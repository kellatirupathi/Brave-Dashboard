import { useGetLeaderboard } from "@workspace/api-client-react";
import { formatINR } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Trophy, Medal, Building2, TrendingUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";

export default function Leaderboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"national" | "campus">("national");
  const [search, setSearch] = useState("");
  
  const { data: leaderboard, isLoading } = useGetLeaderboard({
    view,
    campusId: view === "campus" ? user?.campusId : undefined,
    search: search || undefined
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-muted-foreground mt-1">Race to ₹2,00,000 Verified Revenue</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by team, campus, member name or NIAT ID…" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          
          <Tabs value={view} onValueChange={(v: any) => setView(v)} className="w-full sm:w-auto">
            <TabsList className="w-full sm:w-auto grid grid-cols-2">
              <TabsTrigger value="national">National</TabsTrigger>
              <TabsTrigger value="campus">My Campus</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-4">
          {leaderboard?.map((entry, index) => {
            const isTop3 = entry.rank <= 3;
            const isCurrentUserTeam = entry.teamId === user?.teamId;
            
            return (
              <Card 
                key={entry.teamId} 
                onClick={() => setLocation(`/teams/${entry.teamId}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setLocation(`/teams/${entry.teamId}`); }}
                data-testid={`leaderboard-row-${entry.teamId}`}
                className={`p-4 flex flex-col sm:flex-row items-center gap-4 transition-all hover-elevate cursor-pointer ${isCurrentUserTeam ? 'border-primary shadow-sm bg-primary/5' : ''}`}
              >
                <div className="flex items-center justify-center w-12 h-12 shrink-0">
                  {entry.rank === 1 ? <Trophy className="w-8 h-8 text-yellow-500" /> :
                   entry.rank === 2 ? <Medal className="w-7 h-7 text-gray-400" /> :
                   entry.rank === 3 ? <Medal className="w-6 h-6 text-amber-600" /> :
                   <span className="text-xl font-bold text-muted-foreground w-8 text-center">{entry.rank}</span>}
                </div>
                
                {entry.photoUrl ? (
                  <img src={entry.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center font-bold text-muted-foreground">
                    {entry.teamName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <h3 className="font-bold text-lg">{entry.teamName}</h3>
                    {isCurrentUserTeam && <Badge variant="default" className="text-[10px] h-5 px-1.5 py-0">You</Badge>}
                    {entry.isDemoEligible && <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-100 border-none text-[10px] h-5 px-1.5 py-0">Qualified</Badge>}
                  </div>
                  <div className="flex items-center justify-center sm:justify-start gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {entry.campusName}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> {entry.activeProjects} Projects</span>
                  </div>
                </div>
                
                <div className="text-center sm:text-right mt-4 sm:mt-0 bg-card p-3 sm:p-0 rounded-lg border sm:border-none w-full sm:w-auto">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Verified Revenue</div>
                  <div className="text-2xl font-extrabold text-primary">{formatINR(entry.totalRevenue)}</div>
                  {entry.totalOrderBook > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      + {formatINR(entry.totalOrderBook)} in order book
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          
          {leaderboard?.length === 0 && (
            <div className="text-center py-20 bg-card border rounded-xl border-dashed">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold">No teams found</h3>
              <p className="text-muted-foreground mt-2">Try adjusting your filters.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
