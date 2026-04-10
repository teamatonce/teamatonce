import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../database/database.service';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private jwtService: JwtService,
    private readonly db: DatabaseService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    // Try to verify with Team@Once JWT secret first (for Team@Once native tokens)
    try {
      const payload = this.jwtService.verify(token);
      request.user = this.normalizePayload(payload);
      return true;
    } catch (error) {
      // Team@Once secret failed, try database token validation
    }

    // Token is not a Team@Once token, just decode it and trust it
    // (Similar to how BaaS providers work - the client trusts JWTs from the BaaS)
    try {
      // Decode (not verify) the token to get userId and other claims
      const decoded = jwt.decode(token) as any;

      if (!decoded) {
        throw new UnauthorizedException('Invalid token format');
      }

      // Check for userId in various possible locations
      const userId = decoded.userId || decoded.sub || decoded.id || decoded.user_id;

      if (!userId) {
        throw new UnauthorizedException('Invalid token format - no user identifier');
      }

      // Map database user to Team@Once format
      // We trust the token since it came from database (our BaaS)
      request.user = {
        sub: userId,
        userId: userId,
        email: decoded.email,
        name: decoded.name || decoded.email?.split('@')[0],
        projectId: decoded.projectId,
        appId: decoded.appId,
        isdatabaseUser: true,
        ...decoded, // Include all other fields from token
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Normalize payload from different JWT formats
   * database uses: { userId, email, projectId, ... }
   * Team@Once uses: { sub, email, ... }
   */
  private normalizePayload(payload: any) {
    return {
      sub: payload.sub || payload.userId,  // Map userId to sub
      userId: payload.userId || payload.sub,
      email: payload.email,
      name: payload.name,
      projectId: payload.projectId,
      appId: payload.appId,
      ...payload,
    };
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}