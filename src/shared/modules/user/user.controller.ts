import { inject, injectable } from 'inversify';
import { Logger } from '../../core/logger/index.js';
import { Component } from '../../types/index.js';
import { CreateUserRequest } from './create-user-request.type.js';
import { Config, RestSchema } from '../../core/config/index.js';
import { fillDTO } from '../../utils/index.js';
import { StatusCodes } from 'http-status-codes';
import { LoginUserRequest } from './login-user-request.type.js';
import { BaseController, HttpMethod, HttpError, ValidateDtoMiddleware, DocumentExistsMiddleware, UploadFileMiddleware, ValidateObjectIdMiddleware, PrivateRouteMiddleware } from '../../../rest/libs/index.js';
import { UserRdo } from './rdo/user.rdo.js';
import { Response, Request } from 'express';
import { UserService } from './user-service.interface.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { LoginUserDto } from './dto/login-user.dto.js';
import { AuthService } from '../auth/auth-service.interface.js';
import { LoggedUserRdo } from './rdo/logged-user.rdo.js';

@injectable()
export class UserController extends BaseController {
  constructor(
    @inject(Component.Logger)
    protected readonly logger: Logger,

    @inject(Component.UserService)
    private readonly userService: UserService,

    @inject(Component.Config)
    private readonly configService: Config<RestSchema>,

    @inject(Component.AuthService)
    private readonly authService: AuthService
  ) {
    super(logger);
    this.logger.info('Register routes for UserController...');

    this.addRoute({
      path: '/register',
      method: HttpMethod.Post,
      handler: this.create,
      middlewares: [new ValidateDtoMiddleware(CreateUserDto)],
    });

    this.addRoute({
      path: '/login',
      method: HttpMethod.Post,
      handler: this.login,
      middlewares: [new ValidateDtoMiddleware(LoginUserDto)],
    });

    this.addRoute({
      path: '/login',
      method: HttpMethod.Get,
      handler: this.checkAuth,
    });

    this.addRoute({
      path: '/:userId/avatar',
      method: HttpMethod.Post,
      handler: this.uploadAvatar,
      middlewares: [
        new PrivateRouteMiddleware(),
        new ValidateObjectIdMiddleware('userId'),
        new DocumentExistsMiddleware(this.userService, 'User', 'userId'),
        new UploadFileMiddleware(
          this.configService.get('UPLOAD_DIRECTORY'),
          'avatar'
        ),
      ],
    });
  }

  public async create(
    { body }: CreateUserRequest,
    res: Response
  ): Promise<void> {
    const existsUser = await this.userService.findByEmail(body.email);

    if (existsUser) {
      throw new HttpError(
        StatusCodes.CONFLICT,
        `User with email «${body.email}» exists.`,
        'UserController'
      );
    }

    const result = await this.userService.create(
      body,
      this.configService.get('SALT')
    );

    this.created(res, fillDTO(UserRdo, result));
  }

  public async login(
    { body }: LoginUserRequest,
    res: Response
  ): Promise<void> {
    const user = await this.authService.verify(body);
    const token = await this.authService.authenticate(user);
    const responseData = fillDTO(LoggedUserRdo, {
      token,
    });
    this.ok(res, responseData);
  }

  public async checkAuth(
    { tokenPayload: { email } } : Request,
    res: Response) {
    const foundedUser = await this.userService.findByEmail(email);

    if (!foundedUser) {
      throw new HttpError(
        StatusCodes.UNAUTHORIZED,
        'Unauthorized',
        'UserController'
      );
    }

    this.ok(res, fillDTO(LoggedUserRdo, foundedUser));
  }

  public async uploadAvatar(req: Request, res: Response) {
    this.created(res, {
      filepath: req.file?.path
    });
  }
}
